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
  const CRIME_GRADIENT = [
    { max: 15, color: '#86efac', label: 'Low' },
    { max: 30, color: '#fde047', label: 'Moderate' },
    { max: 50, color: '#fb923c', label: 'High' },
    { max: Infinity, color: '#ef4444', label: 'Critical' },
  ];

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
        weight: 1.4,
        fillColor: color,
        fillOpacity: 0.16,
        opacity: 0.55,
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

      // Label
      L.marker([z.lat, z.lng], {
        icon: L.divIcon({
          html: `<div class="map-zone-label" style="color:${color}">${z.name}</div>`,
          iconSize: [0, 0],
          iconAnchor: [0, -18],
          className: '',
        }),
        interactive: false,
      }).addTo(group);
    });
  }

  /* ── Crime Hotspots Layer ───────────────────────────────────────────── */
  function renderCrimeLayer() {
    const group = _layerGroups.crime;
    group.clearLayers();

    const maxCrime = Math.max(..._zonesData.map(z => z.crime_count || 0), 1);

    _zonesData.forEach(z => {
      const grade = CRIME_GRADIENT.find(g => z.crime_count <= g.max) || CRIME_GRADIENT[CRIME_GRADIENT.length - 1];
      const color = grade.color;
      const radius = 300 + z.crime_count * 6;
      const intensity = Math.max(0.15, Math.min(0.65, (z.crime_count || 0) / maxCrime));

      addBoundaryPolygon(group, z, {
        color,
        weight: 1.3,
        fillColor: color,
        fillOpacity: 0.12 + intensity * 0.4,
        opacity: 0.65,
      });

      // Heatmap-style circle
      L.circle([z.lat, z.lng], {
        radius: radius + 120,
        color: 'transparent', fillColor: color,
        fillOpacity: 0.08, weight: 0,
      }).addTo(group);

      L.circle([z.lat, z.lng], {
        radius,
        color, fillColor: color,
        fillOpacity: 0.22, weight: 2,
        opacity: 0.6,
        dashArray: z.crime_count > 40 ? null : '6, 4',
      }).on('click', () => showZoneDetail(z)).addTo(group);

      // Crime count marker
      L.marker([z.lat, z.lng], {
        icon: L.divIcon({
          html: `<div class="map-crime-marker">
            <span class="crime-count">${z.crime_count}</span>
            <span class="crime-label">incidents</span>
          </div>`,
          iconSize: [60, 36],
          iconAnchor: [30, 18],
          className: '',
        }),
      }).on('click', () => showZoneDetail(z)).addTo(group);
    });
  }

  /* ── Faulty Streetlights Layer ──────────────────────────────────────── */
  function renderLightsLayer() {
    const group = _layerGroups.lights;
    group.clearLayers();

    _zonesData.forEach(z => {
      const faultyPct = z.total_lights > 0 ? z.faulty_lights / z.total_lights : 0;
      const color = faultyPct > 0.6 ? '#ef4444' : faultyPct > 0.3 ? '#fbbf24' : '#34d399';
      const radius = 320 + faultyPct * 380;

      addBoundaryPolygon(group, z, {
        color,
        weight: 1.3,
        fillColor: color,
        fillOpacity: 0.16 + faultyPct * 0.34,
        opacity: 0.7,
      });

      // Glow for faulty areas
      if (faultyPct > 0.3) {
        L.circle([z.lat, z.lng], {
          radius: radius + 100,
          color: 'transparent', fillColor: color,
          fillOpacity: 0.07, weight: 0,
        }).addTo(group);
      }

      L.circle([z.lat, z.lng], {
        radius,
        color, fillColor: color,
        fillOpacity: 0.16, weight: 1.5, opacity: 0.5,
      }).on('click', () => showZoneDetail(z)).addTo(group);

      // Light status icon
      const icon = faultyPct > 0.5 ? '💡' : faultyPct > 0.2 ? '🔦' : '✅';
      L.marker([z.lat, z.lng], {
        icon: L.divIcon({
          html: `<div class="map-light-marker">
            <span class="light-icon">${icon}</span>
            <span class="light-info">${z.faulty_lights}/${z.total_lights}</span>
          </div>`,
          iconSize: [56, 36],
          iconAnchor: [28, 18],
          className: '',
        }),
      }).on('click', () => showZoneDetail(z)).addTo(group);
    });
  }

  /* ── Combined Risk Layer ────────────────────────────────────────────── */
  function renderCombinedLayer() {
    const group = _layerGroups.combined;
    group.clearLayers();

    _zonesData.forEach(z => {
      const risk = z.combined_risk;
      const color = risk > 65 ? '#ef4444' : risk > 40 ? '#f59e0b' : risk > 20 ? '#3b82f6' : '#10b981';
      const radius = 350 + risk * 4;

      addBoundaryPolygon(group, z, {
        color,
        weight: 1.4,
        fillColor: color,
        fillOpacity: 0.12 + (risk / 100) * 0.45,
        opacity: 0.7,
      });

      // Outer glow
      L.circle([z.lat, z.lng], {
        radius: radius + 140,
        color: 'transparent', fillColor: color,
        fillOpacity: 0.06, weight: 0,
      }).addTo(group);

      // Main
      L.circle([z.lat, z.lng], {
        radius,
        color, fillColor: color,
        fillOpacity: 0.2, weight: 2, opacity: 0.6,
      }).on('click', () => showZoneDetail(z)).addTo(group);

      // Combined score badge
      L.marker([z.lat, z.lng], {
        icon: L.divIcon({
          html: `<div class="map-combined-marker" style="border-color:${color}; color:${color}">
            <span class="combined-score">${risk}</span>
            <span class="combined-label">risk</span>
          </div>`,
          iconSize: [48, 36],
          iconAnchor: [24, 18],
          className: '',
        }),
      }).on('click', () => showZoneDetail(z)).addTo(group);
    });
  }

  /* ── Road Risk Corridor Layer ───────────────────────────────────────── */
  function renderRoadLayer() {
    const group = _layerGroups.roads;
    group.clearLayers();

    _roadSegments.forEach(seg => {
      const color = seg.risk_level === 'high' ? '#ef4444' : seg.risk_level === 'medium' ? '#f59e0b' : '#34d399';
      const weight = seg.risk_level === 'high' ? 3 : seg.risk_level === 'medium' ? 2.4 : 2;

      L.polyline(seg.coords, {
        color,
        weight,
        opacity: 0.65,
      }).bindPopup(`
        <strong>${seg.name}</strong><br>
        Ward: ${seg.ward_id}<br>
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
          if (_layerGroups[layer] && _map) {
            _layerGroups[layer].addTo(_map);
          }
        } else {
          _activeLayers.delete(layer);
          if (_layerGroups[layer] && _map) {
            _map.removeLayer(_layerGroups[layer]);
          }
        }
      });
    });
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
            <div class="zd-stat-value">${z.crime_count}</div>
            <div class="zd-stat-label">Crime Incidents</div>
          </div>
        </div>
        <div class="zd-stat">
          <div class="zd-stat-icon" style="background:rgba(251,191,36,0.12);color:#fbbf24">💡</div>
          <div class="zd-stat-content">
            <div class="zd-stat-value">${z.faulty_lights}<span class="zd-stat-unit">/${z.total_lights}</span></div>
            <div class="zd-stat-label">Faulty Lights</div>
          </div>
        </div>
        <div class="zd-stat">
          <div class="zd-stat-icon" style="background:rgba(99,102,241,0.12);color:#818cf8">📊</div>
          <div class="zd-stat-content">
            <div class="zd-stat-value">${z.combined_risk}<span class="zd-stat-unit">%</span></div>
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

  return { init, showZoneDetail, loadDetailedZones, renderAllLayers };
})();
