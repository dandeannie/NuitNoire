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

  const RISK_COLORS = { low: '#34d399', medium: '#fbbf24', high: '#f87171' };
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
        const radius = RISK_RADII[z.risk] || 400;

        // If ward boundary geometry is available, draw the polygon first.
        if (z.boundary && z.boundary.type === 'Polygon' && Array.isArray(z.boundary.coordinates)) {
          const ring = z.boundary.coordinates[0] || [];
          const latlngs = ring
            .filter(pt => Array.isArray(pt) && pt.length >= 2)
            .map(pt => [pt[1], pt[0]]);
          if (latlngs.length > 2) {
            const poly = L.polygon(latlngs, {
              color,
              weight: 1.5,
              fillColor: color,
              fillOpacity: 0.18,
              opacity: 0.6,
            });
            poly.bindPopup(zonePopup(z, color));
            poly.addTo(_layers.zones);
          }
        }

        // Outer glow
        L.circle([z.lat, z.lng], {
          radius: radius + 100,
          color: 'transparent', fillColor: color,
          fillOpacity: 0.06, weight: 0,
        }).addTo(_layers.zones);

        // Main circle
        const circle = L.circle([z.lat, z.lng], {
          radius,
          color, fillColor: color,
          fillOpacity: 0.15, weight: 1.5, opacity: 0.5,
        });
        circle.bindPopup(zonePopup(z, color));
        circle.addTo(_layers.zones);

        // Center dot
        L.circleMarker([z.lat, z.lng], {
          radius: 3, color, fillColor: color,
          fillOpacity: 0.8, weight: 0,
        }).addTo(_layers.zones);
      });
      return data.zones;
    } catch (e) {
      console.error('Risk zones error:', e);
      return [];
    }
  }

  function zonePopup(z, color) {
    return `<div style="font-family:Inter,sans-serif;font-size:13px;min-width:160px;color:#1e293b">
      <div style="font-weight:700;margin-bottom:4px">${z.name}</div>
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
        <span style="width:8px;height:8px;border-radius:50%;background:${color}"></span>
        <span style="font-weight:600;color:${color}">${z.risk.toUpperCase()} RISK</span>
      </div>
      <div style="font-size:12px;color:#64748b">
        Score: <strong style="color:#334155">${z.score}</strong>/100
      </div>
      <div style="margin-top:6px;height:4px;background:rgba(0,0,0,0.08);border-radius:2px;overflow:hidden">
        <div style="width:${z.score}%;height:100%;background:${color};border-radius:2px"></div>
      </div>
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
