/* ══════════════════════════════════════════════════════════════════════════
   Nuit Noire — Explore Layers Module
   Toggle layers: crime hotspots, faulty streetlights, combined risk
   Click zone to see details (crime count, light status, risk score)
   ══════════════════════════════════════════════════════════════════════════ */

const ExploreLayers = (() => {
  let _map = null;
  let _zonesData = [];
  let _roadSegments = [];
  let _activeLayers = new Set(['risk']);
  let _isRouteFocus = false;
  let _isCleanMode = false;

  // Layer groups
  const _layerGroups = {
    risk: null,
    crime: null,
    lights: null,
    combined: null,
    roads: null,
  };

  // Colors
  const RISK_COLORS = { low: '#34d399', medium: '#fbbf24', high: '#f87171' };
  function toNumber(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function buildStats(values) {
    const nums = values
      .map(v => toNumber(v, NaN))
      .filter(v => Number.isFinite(v))
      .sort((a, b) => a - b);

    if (!nums.length) {
      return { min: 0, max: 1, q1: 0.25, q2: 0.5, q3: 0.75 };
    }

    const at = (p) => nums[Math.max(0, Math.min(nums.length - 1, Math.floor((nums.length - 1) * p)))];
    return {
      min: nums[0],
      max: nums[nums.length - 1],
      q1: at(0.25),
      q2: at(0.5),
      q3: at(0.75),
    };
  }

  function unitScale(value, min, max) {
    if (max <= min) return 0.5;
    return Math.max(0, Math.min(1, (value - min) / (max - min)));
  }

  function pickQuantileBin(value, stats) {
    if (value <= stats.q1) return 0;
    if (value <= stats.q2) return 1;
    if (value <= stats.q3) return 2;
    return 3;
  }

  function colorByQuantile(value, stats, palette) {
    return palette[pickQuantileBin(value, stats)] || palette[palette.length - 1];
  }

  function colorByBand(value, bands, fallback) {
    for (const band of bands) {
      if (value <= band.max) return band.color;
    }
    return fallback;
  }

  function radiusFromUnit(unit, minRadius, maxRadius) {
    return Math.round(minRadius + (maxRadius - minRadius) * unit);
  }

  function compactNumber(v) {
    const n = toNumber(v, 0);
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(Math.round(n));
  }

  function getBoundaryLatLngs(z) {
    if (!z.boundary || z.boundary.type !== 'Polygon' || !Array.isArray(z.boundary.coordinates)) return null;
    const ring = z.boundary.coordinates[0] || [];
    const latlngs = ring
      .filter(pt => Array.isArray(pt) && pt.length >= 2)
      .map(pt => [pt[1], pt[0]]);
    return latlngs.length > 2 ? latlngs : null;
  }

  function addBoundaryPolygon(group, z, opts) {
    const latlngs = getBoundaryLatLngs(z);
    if (!latlngs) return false;
    L.polygon(latlngs, opts).on('click', () => showZoneDetail(z)).addTo(group);
    return true;
  }

  /* ── Initialize ────────────────────────────────────────────────────────── */
  function init(map) {
    _map = map;
    // Create layer groups
    Object.keys(_layerGroups).forEach(key => {
      _layerGroups[key] = L.layerGroup();
    });
    // Add default risk layer
    _layerGroups.risk.addTo(_map);

    loadDetailedZones();
    bindLayerButtons();
    bindDetailPanel();
    updateLayerLegend();
  }

  /* ── Load zone data ──────────────────────────────────────────────────── */
  async function loadDetailedZones() {
    try {
      const [zonesRes, roadsRes] = await Promise.all([
        fetch('/api/zones-detail'),
        fetch('/api/road-segments?limit=2000'),
      ]);
      const zonesData = await zonesRes.json();
      const roadsData = await roadsRes.json();
      _zonesData = zonesData.zones || [];
      _roadSegments = roadsData.segments || [];
      renderAllLayers();
    } catch (e) {
      console.error('Failed to load detailed zones:', e);
    }
  }

  /* ── Render all layer groups ─────────────────────────────────────────── */
  function renderAllLayers() {
    renderRiskLayer();
    renderCrimeLayer();
    renderLightsLayer();
    renderCombinedLayer();
    renderRoadLayer();
    applyVisualState();
  }

  /* ── Risk Layer (original circles) ──────────────────────────────────── */
  function renderRiskLayer() {
    const group = _layerGroups.risk;
    group.clearLayers();

    const RISK_RADII = { low: 420, medium: 520, high: 650 };

    _zonesData.forEach(z => {
      const color = RISK_COLORS[z.risk] || '#94a3b8';
      const radius = RISK_RADII[z.risk] || 400;

      addBoundaryPolygon(group, z, {
        color,
        weight: 1.15,
        fillColor: color,
        fillOpacity: 0.12,
        opacity: 0.45,
        smoothFactor: 1.4,
      });

      // Outer glow
      L.circle([z.lat, z.lng], {
        radius: radius + 100,
        color: 'transparent', fillColor: color,
        fillOpacity: 0.06, weight: 0,
      }).addTo(group);

      // Main circle
      const circle = L.circle([z.lat, z.lng], {
        radius,
        color, fillColor: color,
        fillOpacity: 0.18, weight: 1.5, opacity: 0.5,
      });
      circle.on('click', () => showZoneDetail(z));
      circle.addTo(group);

      // Center dot
      L.circleMarker([z.lat, z.lng], {
        radius: 4, color, fillColor: color,
        fillOpacity: 0.9, weight: 0,
      }).on('click', () => showZoneDetail(z)).addTo(group);

      // Avoid dense permanent labels; keep interaction through click and details panel.
    });
  }

  /* ── Crime Hotspots Layer ───────────────────────────────────────────── */
  function renderCrimeLayer() {
    const group = _layerGroups.crime;
    group.clearLayers();

    const crimeStats = buildStats(_zonesData.map(z => toNumber(z.crime_index, toNumber(z.crime_count, 0))));
    const crimeBands = [
      { max: 24, color: '#34d399' },
      { max: 49, color: '#fde047' },
      { max: 74, color: '#fb923c' },
      { max: 100, color: '#ef4444' },
    ];

    _zonesData.forEach(z => {
      const crimeCount = toNumber(z.crime_count, 0);
      const crimeIndex = toNumber(z.crime_index, 0);
      const unit = unitScale(crimeIndex, crimeStats.min, crimeStats.max);
      const color = colorByBand(crimeIndex, crimeBands, '#ef4444');
      const radius = radiusFromUnit(unit, 180, 430);
      const intensity = 0.14 + unit * 0.38;

      addBoundaryPolygon(group, z, {
        color,
        weight: 1.4,
        fillColor: color,
        fillOpacity: intensity,
        opacity: 0.72,
      });

      L.circle([z.lat, z.lng], {
        radius,
        color, fillColor: color,
        fillOpacity: 0.12 + unit * 0.18,
        weight: 1.5,
        opacity: 0.55,
      }).on('click', () => showZoneDetail(z)).addTo(group);

      if (unit >= 0.45) {
        L.marker([z.lat, z.lng], {
          icon: L.divIcon({
            html: `<div class="map-crime-marker" style="border-color:${color}88;color:${color}">
              <span class="crime-count">${crimeIndex}</span>
              <span class="crime-label">crime idx</span>
            </div>`,
            iconSize: [52, 30],
            iconAnchor: [26, 15],
            className: '',
          }),
        }).on('click', () => showZoneDetail(z)).addTo(group);
      }
    });
  }

  /* ── Faulty Streetlights Layer ──────────────────────────────────────── */
  function renderLightsLayer() {
    const group = _layerGroups.lights;
    group.clearLayers();

    const faultyPctValues = _zonesData.map(z => toNumber(z.faulty_lights_pct, 0));
    const lightStats = buildStats(faultyPctValues);
    const lightsBands = [
      { max: 25, color: '#10b981' },
      { max: 45, color: '#84cc16' },
      { max: 60, color: '#fbbf24' },
      { max: 100, color: '#ef4444' },
    ];

    _zonesData.forEach(z => {
      const totalLights = Math.max(0, toNumber(z.total_lights, 0));
      const faultyLights = Math.max(0, toNumber(z.faulty_lights, 0));
      const faultyPctDisplay = Math.round(toNumber(z.faulty_lights_pct, totalLights > 0 ? (faultyLights / totalLights) * 100 : 0));
      const unit = unitScale(faultyPctDisplay, lightStats.min, lightStats.max);
      const color = colorByBand(faultyPctDisplay, lightsBands, '#ef4444');
      const radius = radiusFromUnit(unit, 170, 360);

      addBoundaryPolygon(group, z, {
        color,
        weight: 1.3,
        fillColor: color,
        fillOpacity: 0.14 + unit * 0.34,
        opacity: 0.72,
      });

      if (unit >= 0.7) {
        L.circle([z.lat, z.lng], {
          radius: radius + 40,
          color: 'transparent', fillColor: color,
          fillOpacity: 0.08, weight: 0,
        }).addTo(group);
      }

      L.circle([z.lat, z.lng], {
        radius,
        color, fillColor: color,
        fillOpacity: 0.12 + unit * 0.15,
        weight: 1.3,
        opacity: 0.52,
      }).on('click', () => showZoneDetail(z)).addTo(group);

      if (unit >= 0.35) {
        const icon = unit >= 0.75 ? '⚠' : (unit >= 0.5 ? '◐' : '○');
        L.marker([z.lat, z.lng], {
          icon: L.divIcon({
            html: `<div class="map-light-marker" style="border-color:${color}88;color:${color}">
              <span class="light-icon">${icon}</span>
              <span class="light-info">${faultyPctDisplay}% bad</span>
            </div>`,
            iconSize: [64, 28],
            iconAnchor: [32, 14],
            className: '',
          }),
        }).on('click', () => showZoneDetail(z)).addTo(group);
      }
    });
  }

  /* ── Combined Risk Layer ────────────────────────────────────────────── */
  function renderCombinedLayer() {
    const group = _layerGroups.combined;
    group.clearLayers();

    const combinedStats = buildStats(_zonesData.map(z => toNumber(z.combined_risk_rounded, z.combined_risk)));
    const combinedBands = [
      { max: 49, color: '#10b981' },
      { max: 59, color: '#60a5fa' },
      { max: 69, color: '#f59e0b' },
      { max: 100, color: '#ef4444' },
    ];

    _zonesData.forEach(z => {
      const risk = toNumber(z.combined_risk, 0);
      const riskDisplay = toNumber(z.combined_risk_rounded, Math.round(risk));
      const unit = unitScale(riskDisplay, combinedStats.min, combinedStats.max);
      const color = colorByBand(riskDisplay, combinedBands, '#ef4444');
      const radius = radiusFromUnit(unit, 190, 420);

      addBoundaryPolygon(group, z, {
        color,
        weight: 1.4,
        fillColor: color,
        fillOpacity: 0.14 + unit * 0.36,
        opacity: 0.74,
      });

      // Main
      L.circle([z.lat, z.lng], {
        radius,
        color, fillColor: color,
        fillOpacity: 0.14 + unit * 0.16,
        weight: 1.5,
        opacity: 0.54,
      }).on('click', () => showZoneDetail(z)).addTo(group);

      // Combined score badge
      if (unit >= 0.45) {
        L.marker([z.lat, z.lng], {
          icon: L.divIcon({
            html: `<div class="map-combined-marker" style="border-color:${color}; color:${color}">
              <span class="combined-score">${riskDisplay}</span>
              <span class="combined-label">risk</span>
            </div>`,
            iconSize: [46, 30],
            iconAnchor: [23, 15],
            className: '',
          }),
        }).on('click', () => showZoneDetail(z)).addTo(group);
      }
    });
  }

  /* ── Road Risk Corridor Layer ───────────────────────────────────────── */
  function renderRoadLayer() {
    const group = _layerGroups.roads;
    group.clearLayers();

    const usableSegments = _roadSegments.filter(seg => Array.isArray(seg.coords) && seg.coords.length >= 2);
    const roadRiskStats = buildStats(usableSegments.map(seg => seg.risk_score));
    const roadPalette = ['#34d399', '#facc15', '#fb923c', '#ef4444'];
    const maxSegments = _map && _map.getZoom && _map.getZoom() >= 13 ? 1200 : 750;
    const prioritized = usableSegments
      .slice()
      .sort((a, b) => toNumber(b.risk_score, 0) - toNumber(a.risk_score, 0))
      .slice(0, maxSegments);

    prioritized.forEach(seg => {
      const riskScore = toNumber(seg.risk_score, 0);
      const unit = unitScale(riskScore, roadRiskStats.min, roadRiskStats.max);
      const color = colorByQuantile(riskScore, roadRiskStats, roadPalette);
      const weight = 1.5 + unit * 2;

      L.polyline(seg.coords, {
        color,
        weight,
        opacity: 0.2 + unit * 0.6,
        dashArray: unit < 0.3 ? '5, 6' : null,
      }).bindPopup(`
        <strong>${seg.name}</strong><br>
        Area ID: ${seg.ward_id}<br>
        Risk: ${seg.risk_level.toUpperCase()} (${seg.risk_score})<br>
        Length: ${Math.round(seg.length_m)} m
      `).addTo(group);
    });
  }

  /* ── Layer toggle ───────────────────────────────────────────────────── */
  function bindLayerButtons() {
    document.querySelectorAll('.layer-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const layer = btn.dataset.layer;
        if (!_layerGroups[layer]) return;
        btn.classList.toggle('active');

        if (btn.classList.contains('active')) {
          _activeLayers.add(layer);
          if (_layerGroups[layer] && _map && !_isCleanMode) {
            _layerGroups[layer].addTo(_map);
          }
        } else {
          _activeLayers.delete(layer);
          if (_layerGroups[layer] && _map) {
            _map.removeLayer(_layerGroups[layer]);
          }
        }

        updateLayerLegend();
        applyVisualState();
      });
    });
  }

  function updateLayerLegend() {
    const wrap = document.getElementById('layer-legend-strip');
    if (!wrap) return;

    const has = (layer) => _activeLayers.has(layer);
    const pills = [];

    if (has('risk')) {
      pills.push('<span class="layer-legend-pill"><span class="layer-legend-swatch" style="background:#34d399"></span>Low</span>');
      pills.push('<span class="layer-legend-pill"><span class="layer-legend-swatch" style="background:#fbbf24"></span>Medium</span>');
      pills.push('<span class="layer-legend-pill"><span class="layer-legend-swatch" style="background:#f87171"></span>High</span>');
    }

    if (has('crime')) {
      pills.push('<span class="layer-legend-pill"><span class="layer-legend-swatch" style="background:#34d399"></span>Crime idx 0-24</span>');
      pills.push('<span class="layer-legend-pill"><span class="layer-legend-swatch" style="background:#fde047"></span>25-49</span>');
      pills.push('<span class="layer-legend-pill"><span class="layer-legend-swatch" style="background:#fb923c"></span>50-74</span>');
      pills.push('<span class="layer-legend-pill"><span class="layer-legend-swatch" style="background:#ef4444"></span>75-100</span>');
    }

    if (has('lights')) {
      pills.push('<span class="layer-legend-pill"><span class="layer-legend-swatch" style="background:#10b981"></span>Faulty ≤25%</span>');
      pills.push('<span class="layer-legend-pill"><span class="layer-legend-swatch" style="background:#84cc16"></span>≤45%</span>');
      pills.push('<span class="layer-legend-pill"><span class="layer-legend-swatch" style="background:#fbbf24"></span>≤60%</span>');
      pills.push('<span class="layer-legend-pill"><span class="layer-legend-swatch" style="background:#ef4444"></span>>60%</span>');
    }

    if (has('combined')) {
      pills.push('<span class="layer-legend-pill"><span class="layer-legend-swatch" style="background:#10b981"></span>Risk ≤49</span>');
      pills.push('<span class="layer-legend-pill"><span class="layer-legend-swatch" style="background:#60a5fa"></span>≤59</span>');
      pills.push('<span class="layer-legend-pill"><span class="layer-legend-swatch" style="background:#f59e0b"></span>≤69</span>');
      pills.push('<span class="layer-legend-pill"><span class="layer-legend-swatch" style="background:#ef4444"></span>>69</span>');
    }

    if (has('roads')) {
      pills.push('<span class="layer-legend-pill"><span class="layer-legend-swatch" style="background:#34d399"></span>Lower corridor risk</span>');
      pills.push('<span class="layer-legend-pill"><span class="layer-legend-swatch" style="background:#ef4444"></span>Higher corridor risk</span>');
    }

    wrap.innerHTML = pills.length ? pills.join('') : '<span class="layer-legend-pill">No layer selected</span>';
  }

  function setGroupMuted(group, muted) {
    if (!group) return;
    group.eachLayer(layer => {
      if (layer.setStyle) {
        if (!layer._nuitOriginalStyle) {
          layer._nuitOriginalStyle = {
            opacity: layer.options.opacity,
            fillOpacity: layer.options.fillOpacity,
            weight: layer.options.weight,
          };
        }
        const base = layer._nuitOriginalStyle;
        layer.setStyle({
          opacity: muted ? Math.max(0.08, (base.opacity || 0.5) * 0.32) : base.opacity,
          fillOpacity: muted ? Math.max(0.03, (base.fillOpacity || 0.2) * 0.2) : base.fillOpacity,
          weight: muted ? Math.max(1, (base.weight || 1.5) * 0.85) : base.weight,
        });
      } else if (layer.setOpacity) {
        if (layer._nuitOriginalOpacity === undefined) {
          layer._nuitOriginalOpacity = 1;
        }
        layer.setOpacity(muted ? 0.22 : layer._nuitOriginalOpacity);
      }
    });
  }

  function applyVisualState() {
    if (!_map) return;

    if (_isCleanMode) {
      Object.values(_layerGroups).forEach(group => {
        if (group) _map.removeLayer(group);
      });
      document.body.classList.add('clean-mode-on');
    } else {
      Object.keys(_layerGroups).forEach(key => {
        if (_activeLayers.has(key) && _layerGroups[key]) {
          _layerGroups[key].addTo(_map);
        } else if (_layerGroups[key]) {
          _map.removeLayer(_layerGroups[key]);
        }
      });
      document.body.classList.remove('clean-mode-on');
    }

    const muted = _isRouteFocus && !_isCleanMode;
    Object.values(_layerGroups).forEach(group => setGroupMuted(group, muted));
    document.body.classList.toggle('route-focus-active', muted);
  }

  function setRouteFocus(enabled) {
    _isRouteFocus = Boolean(enabled);
    applyVisualState();
  }

  function setCleanMode(enabled) {
    _isCleanMode = Boolean(enabled);
    applyVisualState();
  }

  function isCleanMode() {
    return _isCleanMode;
  }

  /* ── Zone Detail Panel ──────────────────────────────────────────────── */
  function showZoneDetail(z) {
    const panel = document.getElementById('zone-detail-panel');
    const content = document.getElementById('zone-detail-content');
    if (!panel || !content) return;

    const riskColor = RISK_COLORS[z.risk] || '#94a3b8';
    const faultyPct = z.total_lights > 0 ? Math.round((z.faulty_lights / z.total_lights) * 100) : 0;
    const workingPct = 100 - faultyPct;
    const lightStatus = faultyPct > 50 ? 'Critical' : faultyPct > 25 ? 'Degraded' : 'Good';
    const lightStatusColor = faultyPct > 50 ? '#ef4444' : faultyPct > 25 ? '#fbbf24' : '#34d399';

    content.innerHTML = `
      <div class="zd-header">
        <div class="zd-title">${z.name}</div>
        <span class="badge badge-${z.risk}">${z.risk.toUpperCase()} RISK</span>
      </div>

      <div class="zd-score-row">
        <div class="zd-score-ring">
          <svg viewBox="0 0 100 100" class="zd-ring-svg">
            <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(99,102,241,0.1)" stroke-width="7"/>
            <circle cx="50" cy="50" r="42" fill="none" stroke="${riskColor}" stroke-width="7"
              stroke-dasharray="${z.score * 2.64} 264"
              stroke-dashoffset="0" stroke-linecap="round"
              transform="rotate(-90 50 50)"
              class="zd-ring-progress"/>
          </svg>
          <div class="zd-ring-value" style="color:${riskColor}">${z.score}</div>
        </div>
        <div class="zd-score-info">
          <div class="zd-score-label">Overall Risk Score</div>
          <div class="zd-score-desc">Based on crime density, lighting, and traffic analysis</div>
        </div>
      </div>

      <div class="zd-divider"></div>

      <div class="zd-stats-grid">
        <div class="zd-stat">
          <div class="zd-stat-icon" style="background:rgba(239,68,68,0.12);color:#ef4444">🚨</div>
          <div class="zd-stat-content">
            <div class="zd-stat-value">${toNumber(z.crime_index, 0)}<span class="zd-stat-unit">/100</span></div>
            <div class="zd-stat-label">Crime Index</div>
          </div>
        </div>
        <div class="zd-stat">
          <div class="zd-stat-icon" style="background:rgba(251,191,36,0.12);color:#fbbf24">💡</div>
          <div class="zd-stat-content">
            <div class="zd-stat-value">${toNumber(z.faulty_lights_pct, faultyPct).toFixed(1)}<span class="zd-stat-unit">%</span></div>
            <div class="zd-stat-label">Faulty Lights</div>
          </div>
        </div>
        <div class="zd-stat">
          <div class="zd-stat-icon" style="background:rgba(99,102,241,0.12);color:#818cf8">📊</div>
          <div class="zd-stat-content">
            <div class="zd-stat-value">${toNumber(z.combined_risk_rounded, Math.round(z.combined_risk))}<span class="zd-stat-unit">%</span></div>
            <div class="zd-stat-label">Combined Risk</div>
          </div>
        </div>
        <div class="zd-stat">
          <div class="zd-stat-icon" style="background:rgba(52,211,153,0.12);color:#34d399">🚗</div>
          <div class="zd-stat-content">
            <div class="zd-stat-value">${Math.round(z.traffic * 100)}<span class="zd-stat-unit">%</span></div>
            <div class="zd-stat-label">Traffic Density</div>
          </div>
        </div>
      </div>

      <div class="zd-divider"></div>

      <div class="zd-section-title">Streetlight Status</div>
      <div class="zd-light-bar-wrap">
        <div class="zd-light-bar">
          <div class="zd-light-bar-fill working" style="width:${workingPct}%"></div>
          <div class="zd-light-bar-fill faulty" style="width:${faultyPct}%"></div>
        </div>
        <div class="zd-light-bar-labels">
          <span style="color:#34d399">✓ ${z.working_lights} Working</span>
          <span style="color:${lightStatusColor}">⚠ ${z.faulty_lights} Faulty (${faultyPct}%)</span>
        </div>
        <div class="zd-light-status" style="color:${lightStatusColor}">
          Infrastructure: <strong>${lightStatus}</strong>
        </div>
      </div>

      <div class="zd-divider"></div>

      <div class="zd-section-title">Zone Attributes</div>
      <div class="zd-attrs">
        <div class="zd-attr-row">
          <span class="zd-attr-label">Area Type</span>
          <span class="zd-attr-value">${z.area.charAt(0).toUpperCase() + z.area.slice(1)}</span>
        </div>
        <div class="zd-attr-row">
          <span class="zd-attr-label">Lighting Level</span>
          <div class="zd-attr-bar-wrap">
            <div class="zd-attr-bar" style="width:${Math.round(z.lighting * 100)}%; background:${z.lighting > 0.6 ? '#34d399' : z.lighting > 0.3 ? '#fbbf24' : '#ef4444'}"></div>
          </div>
          <span class="zd-attr-val">${Math.round(z.lighting * 100)}%</span>
        </div>
        <div class="zd-attr-row">
          <span class="zd-attr-label">Traffic Flow</span>
          <div class="zd-attr-bar-wrap">
            <div class="zd-attr-bar" style="width:${Math.round(z.traffic * 100)}%; background:#818cf8"></div>
          </div>
          <span class="zd-attr-val">${Math.round(z.traffic * 100)}%</span>
        </div>
        <div class="zd-attr-row">
          <span class="zd-attr-label">Accidents</span>
          <span class="zd-attr-value">${z.accidents} recorded</span>
        </div>
      </div>

      <div class="zd-footer-hint">
        <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M13 16h-1v-4h-1m1-4h.01"/><circle cx="12" cy="12" r="10"/></svg>
        Click another zone to compare
      </div>
    `;

    panel.classList.add('visible');

    // Fly to zone
    if (_map) {
      _map.flyTo([z.lat, z.lng], 14, { duration: 0.8 });
    }
  }

  function bindDetailPanel() {
    const closeBtn = document.getElementById('zone-detail-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        const panel = document.getElementById('zone-detail-panel');
        if (panel) panel.classList.remove('visible');
      });
    }
  }

  return {
    init,
    showZoneDetail,
    loadDetailedZones,
    renderAllLayers,
    setRouteFocus,
    setCleanMode,
    isCleanMode,
  };
})();
