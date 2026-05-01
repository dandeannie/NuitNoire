/* ══════════════════════════════════════════════════════════════════════════
   Nuit Noire — Map Module
   Click-to-place markers, animated risk zones, route rendering
   ══════════════════════════════════════════════════════════════════════════ */

const NuitMap = (() => {
  const MUMBAI = [19.0760, 72.8777];
  const ZOOM = 12;
  const TILE_DARK  = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  const TILE_LIGHT = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
  const ATTR = '&copy; <a href="https://carto.com/">CARTO</a>';

  // Enhanced color palette: more saturated, better visual separation
  const RISK_COLORS = { 
    low: '#10b981',      // Emerald green - more saturated
    medium: '#f59e0b',   // Amber/orange - more distinct from red
    high: '#ef4444'      // Bright red - more vibrant
  };
  const RISK_COLORS_BORDER = {
    low: '#059669',      // Darker emerald for borders
    medium: '#d97706',   // Darker amber for borders
    high: '#dc2626'      // Darker red for borders
  };
  const RISK_RADII  = { low: 420, medium: 520, high: 650 };

  let _map = null;
  let _tileLayer = null;
  const _layers = { zones: null, route: null, markers: null };
  const _routeAnimTimers = [];
  let _clickMode = null;   // 'start' | 'dest' | null
  let _clickCallbacks = [];

  /* ── Create map ──────────────────────────────────────────────────────── */
  function createMap(id, opts = {}) {
    _map = L.map(id, {
      center: opts.center || MUMBAI,
      zoom: opts.zoom || ZOOM,
      zoomControl: false,
      attributionControl: false,
    });

    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    _tileLayer = L.tileLayer(isLight ? TILE_LIGHT : TILE_DARK, { attribution: ATTR, maxZoom: 18 }).addTo(_map);
    L.control.zoom({ position: 'topright' }).addTo(_map);
    L.control.attribution({ position: 'bottomright' }).addTo(_map);

    _layers.zones   = L.layerGroup().addTo(_map);
    _layers.route   = L.layerGroup().addTo(_map);
    _layers.markers = L.layerGroup().addTo(_map);

    // Click-to-place handler
    _map.on('click', e => {
      if (_clickMode && _clickCallbacks.length) {
        _clickCallbacks.forEach(cb => cb(_clickMode, e.latlng));
      }
    });

    return _map;
  }

  /* ── Click mode management ───────────────────────────────────────────── */
  function setClickMode(mode) { _clickMode = mode; }
  function getClickMode() { return _clickMode; }
  function onMapClick(cb) { _clickCallbacks.push(cb); }

  /* ── Load risk zones ─────────────────────────────────────────────────── */
  async function loadRiskZones() {
    try {
      const res = await fetch('/api/risk-zones');
      const data = await res.json();
      _layers.zones.clearLayers();

      data.zones.forEach(z => {
        const color = RISK_COLORS[z.risk] || '#94a3b8';
        const borderColor = RISK_COLORS_BORDER[z.risk] || '#64748b';
        const radius = RISK_RADII[z.risk] || 400;
        const isHighRisk = z.risk === 'high';

        // If ward boundary geometry is available, draw the polygon
        if (z.boundary && z.boundary.type === 'Polygon' && Array.isArray(z.boundary.coordinates)) {
          const ring = z.boundary.coordinates[0] || [];
          const latlngs = ring
            .filter(pt => Array.isArray(pt) && pt.length >= 2)
            .map(pt => [pt[1], pt[0]]);
          if (latlngs.length > 2) {
            const poly = L.polygon(latlngs, {
              color: borderColor,
              weight: isHighRisk ? 2.5 : 1.8,
              fillColor: color,
              fillOpacity: isHighRisk ? 0.15 : 0.08,
              opacity: 0.85,
              lineCap: 'round',
              lineJoin: 'round',
              dashArray: null,
            });
            poly.bindPopup(zonePopup(z, color));
            poly.addTo(_layers.zones);
          }
        } else {
          // Fallback to circle representation only if no boundary
          const circle = L.circle([z.lat, z.lng], {
            radius,
            color: borderColor,
            fillColor: color,
            fillOpacity: isHighRisk ? 0.15 : 0.08,
            weight: isHighRisk ? 2.5 : 1.8,
            opacity: 0.85,
            lineCap: 'round',
            lineJoin: 'round',
          });
          circle.bindPopup(zonePopup(z, color));
          circle.addTo(_layers.zones);
        }

        // Simple center marker - minimal visual clutter
        L.circleMarker([z.lat, z.lng], {
          radius: isHighRisk ? 4 : 2.5, 
          color: borderColor,
          fillColor: color,
          fillOpacity: 0.95,
          weight: 1.5,
        }).addTo(_layers.zones);
      });
      return data.zones;
    } catch (e) {
      console.error('Risk zones error:', e);
      return [];
    }
  }

  function zonePopup(z, color) {
    const riskMap = { low: 'LOW', medium: 'MEDIUM', high: 'HIGH' };
    const riskLevel = riskMap[z.risk] || 'UNKNOWN';
    return `<div style="font-family:Inter,sans-serif;font-size:13px;min-width:180px;color:#1e293b">
      <div style="font-weight:700;margin-bottom:6px;font-size:14px">${z.name}</div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;padding:6px;background:rgba(0,0,0,0.04);border-radius:6px">
        <span style="width:10px;height:10px;border-radius:50%;background:${color};box-shadow:0 0 8px ${color}66"></span>
        <span style="font-weight:700;color:${color}">${riskLevel} RISK</span>
      </div>
      <div style="font-size:12px;color:#64748b;margin-bottom:6px">
        Safety Score: <strong style="color:${color};font-size:13px">${z.score}</strong>/100
      </div>
      <div style="margin:8px 0;height:6px;background:rgba(0,0,0,0.1);border-radius:3px;overflow:hidden;box-shadow:inset 0 1px 2px rgba(0,0,0,0.05)">
        <div style="width:${z.score}%;height:100%;background:linear-gradient(90deg, ${color}, ${color}dd);border-radius:3px;transition:width 0.3s ease"></div>
      </div>
      <div style="font-size:11px;color:#94a3b8;margin-top:4px">Click zone for details</div>
    </div>`;
  }

  /* ── Draw route with animation ───────────────────────────────────────── */
  function drawRoute(coords, opts = {}) {
    const color = opts.color || '#818cf8';
    const dash = opts.dash || null;
    const weight = opts.weight || 4;

    // Draw a subtle casing first so routes stay visible over dense polygons.
    const casing = L.polyline(coords, {
      color: opts.casingColor || 'rgba(255,255,255,0.5)',
      weight: (weight + 3),
      opacity: opts.casingOpacity || 0.5,
      lineCap: 'round', lineJoin: 'round',
      dashArray: dash,
    });
    casing.addTo(_layers.route);

    if (opts.glow) {
      L.polyline(coords, {
        color: opts.glowColor || color,
        weight: weight + 10,
        opacity: opts.glowOpacity || 0.18,
        lineCap: 'round', lineJoin: 'round',
      }).addTo(_layers.route);
    }

    const line = L.polyline(coords, {
      color, weight,
      opacity: opts.opacity || 0.85,
      dashArray: dash || (opts.animate ? '14 12' : null),
      lineCap: 'round', lineJoin: 'round',
    });
    line.addTo(_layers.route);
    line.bringToFront();

    if (opts.animate) {
      let offset = 0;
      const timer = setInterval(() => {
        offset -= 1.4;
        if (line && line.setStyle) {
          line.setStyle({ dashOffset: String(offset) });
        }
      }, 60);
      _routeAnimTimers.push(timer);
    }

    return line;
  }

  /* ── Markers ─────────────────────────────────────────────────────────── */
  function addMarker(lat, lng, opts = {}) {
    const color = opts.color || '#818cf8';
    const size = opts.size || 14;
    const html = `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${color};
      border:2.5px solid rgba(255,255,255,0.9);
      box-shadow:0 0 12px ${color}88, 0 0 24px ${color}44;
    "></div>`;

    const marker = L.marker([lat, lng], {
      icon: L.divIcon({
        html, iconSize: [size + 6, size + 6],
        iconAnchor: [(size + 6) / 2, (size + 6) / 2], className: '',
      }),
    });
    if (opts.popup) marker.bindPopup(opts.popup);
    marker.addTo(_layers.markers);
    return marker;
  }

  /* ── Utilities ───────────────────────────────────────────────────────── */
  function clearRoutes() {
    while (_routeAnimTimers.length) {
      const t = _routeAnimTimers.pop();
      clearInterval(t);
    }
    if (_layers.route) _layers.route.clearLayers();
    if (_layers.markers) _layers.markers.clearLayers();
  }
  function clearAll()   { Object.values(_layers).forEach(l => l && l.clearLayers()); }
  function fitBounds(coords, pad = 60) {
    if (_map && coords.length) _map.fitBounds(coords, { padding: [pad, pad] });
  }
  function setView(lat, lng, zoom) { if (_map) _map.setView([lat, lng], zoom || 14); }
  function getMap()    { return _map; }
  function getCenter() { return MUMBAI; }
  function setTheme(theme) {
    if (!_map || !_tileLayer) return;
    const url = theme === 'light' ? TILE_LIGHT : TILE_DARK;
    _tileLayer.setUrl(url);
  }

  return {
    createMap, loadRiskZones, drawRoute, addMarker,
    clearRoutes, clearAll, fitBounds, setView,
    getMap, getCenter, setTheme,
    setClickMode, getClickMode, onMapClick,
  };
})();
