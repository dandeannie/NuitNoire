/* ══════════════════════════════════════════════════════════════════════════
   Nuit Noire — Home Page Map & Summary Cards
   Fetches zone detail data, populates summary cards, renders live risk map
   ══════════════════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page !== 'home') return;

  const RISK_COLORS = { low: '#34d399', medium: '#fbbf24', high: '#f87171' };
  const RISK_RADII  = { low: 420, medium: 520, high: 650 };
  const MUMBAI = [19.0760, 72.8777];

  let homeMap = null;

  /* ── Fetch data and populate ────────────────────────────────────────── */
  async function loadHomeData() {
    try {
      const res = await fetch('/api/zones-detail');
      const data = await res.json();
      const zones = data.zones || [];

      populateSummaryCards(zones);
      initHomeMap(zones);
    } catch (e) {
      console.error('Failed to load home data:', e);
    }
  }

  /* ── Summary Cards ──────────────────────────────────────────────────── */
  function populateSummaryCards(zones) {
    const highRisk = zones.filter(z => z.risk === 'high');
    const medRisk = zones.filter(z => z.risk === 'medium');
    const lowRisk = zones.filter(z => z.risk === 'low');

    const totalFaulty = zones.reduce((s, z) => s + z.faulty_lights, 0);
    const totalLights = zones.reduce((s, z) => s + z.total_lights, 0);
    const totalCrime = zones.reduce((s, z) => s + z.crime_count, 0);
    const avgScore = (zones.reduce((s, z) => s + z.score, 0) / zones.length).toFixed(1);

    const safest = zones.reduce((a, b) => a.score < b.score ? a : b, zones[0]);
    const danger = zones.reduce((a, b) => a.score > b.score ? a : b, zones[0]);

    // High-risk zones
    animateValue('hsc-high-val', highRisk.length);
    const trendEl = document.getElementById('hsc-high-trend');
    if (trendEl) {
      const names = highRisk.map(z => z.name).join(', ');
      trendEl.textContent = names;
      trendEl.style.color = 'var(--danger)';
    }

    // Faulty lights
    animateValue('hsc-lights-val', totalFaulty);
    const lightsSub = document.getElementById('hsc-lights-sub');
    if (lightsSub) {
      const pct = totalLights > 0 ? Math.round((totalFaulty / totalLights) * 100) : 0;
      lightsSub.textContent = `${pct}% of ${totalLights} total lights need repair`;
    }

    // Incidents
    animateValue('hsc-incidents-val', totalCrime);
    const incSub = document.getElementById('hsc-incidents-sub');
    if (incSub) {
      incSub.textContent = `Across ${zones.length} monitored neighborhoods`;
    }

    // Avg score
    const avgEl = document.getElementById('hsc-avg-val');
    if (avgEl) {
      animateValue('hsc-avg-val', parseFloat(avgScore));
      const avgSub = document.getElementById('hsc-avg-sub');
      if (avgSub) {
        const level = avgScore > 55 ? 'Elevated' : avgScore > 35 ? 'Moderate' : 'Low';
        const color = avgScore > 55 ? 'var(--danger)' : avgScore > 35 ? 'var(--warning)' : 'var(--success)';
        avgSub.innerHTML = `<span style="color:${color}">● ${level} city-wide risk</span>`;
      }
    }

    // Safest
    const safestEl = document.getElementById('hsc-safest-val');
    if (safestEl && safest) safestEl.textContent = safest.name;

    // Dangerous
    const dangerEl = document.getElementById('hsc-danger-val');
    if (dangerEl && danger) dangerEl.textContent = danger.name;
  }

  function animateValue(id, target) {
    const el = document.getElementById(id);
    if (!el) return;
    const isFloat = !Number.isInteger(target);
    const duration = 1200;
    const start = performance.now();

    function step(now) {
      const progress = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      const val = ease * target;
      el.textContent = isFloat ? val.toFixed(1) : Math.round(val);
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ── Home Risk Map ──────────────────────────────────────────────────── */
  function initHomeMap(zones) {
    const mapEl = document.getElementById('home-risk-map');
    if (!mapEl) return;

    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const tileUrl = isLight
      ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

    homeMap = L.map('home-risk-map', {
      center: MUMBAI,
      zoom: 11,
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: false,
      dragging: true,
      touchZoom: true,
    });

    const tileLayer = L.tileLayer(tileUrl, {
      maxZoom: 16,
      attribution: '&copy; CARTO',
    }).addTo(homeMap);

    // Store for theme switching
    window._homeTileLayer = tileLayer;

    L.control.zoom({ position: 'topright' }).addTo(homeMap);

    // Render zones
    zones.forEach(z => {
      const color = RISK_COLORS[z.risk] || '#94a3b8';
      const radius = RISK_RADII[z.risk] || 400;

      // Outer glow
      L.circle([z.lat, z.lng], {
        radius: radius + 100,
        color: 'transparent', fillColor: color,
        fillOpacity: 0.06, weight: 0,
      }).addTo(homeMap);

      // Main circle
      const circle = L.circle([z.lat, z.lng], {
        radius,
        color, fillColor: color,
        fillOpacity: 0.18, weight: 1.5, opacity: 0.5,
      });

      // Rich popup
      circle.bindPopup(buildZonePopup(z, color), {
        maxWidth: 280,
        className: 'home-zone-popup',
      });

      circle.addTo(homeMap);

      // Center dot
      L.circleMarker([z.lat, z.lng], {
        radius: 4, color, fillColor: color,
        fillOpacity: 0.9, weight: 0,
      }).bindPopup(buildZonePopup(z, color), {
        maxWidth: 280,
        className: 'home-zone-popup',
      }).addTo(homeMap);

      // Name label
      L.marker([z.lat, z.lng], {
        icon: L.divIcon({
          html: `<div class="map-zone-label" style="color:${color}">${z.name}</div>`,
          iconSize: [0, 0],
          iconAnchor: [0, -16],
          className: '',
        }),
        interactive: false,
      }).addTo(homeMap);
    });

    // Fit all zones
    const bounds = zones.map(z => [z.lat, z.lng]);
    if (bounds.length) homeMap.fitBounds(bounds, { padding: [30, 30] });

    // ResizeObserver for proper sizing
    if (window.ResizeObserver) {
      new ResizeObserver(() => homeMap.invalidateSize()).observe(mapEl);
    }
  }

  function buildZonePopup(z, color) {
    const faultyPct = z.total_lights > 0 ? Math.round((z.faulty_lights / z.total_lights) * 100) : 0;
    return `
      <div style="font-family:Inter,sans-serif;font-size:13px;min-width:220px;color:#1e293b">
        <div style="font-weight:800;font-size:15px;margin-bottom:6px">${z.name}</div>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
          <span style="width:10px;height:10px;border-radius:50%;background:${color}"></span>
          <span style="font-weight:700;color:${color};text-transform:uppercase;font-size:12px;letter-spacing:0.04em">${z.risk} Risk</span>
          <span style="margin-left:auto;font-weight:800;color:${color};font-size:16px">${z.score}/100</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px">
          <div style="background:rgba(239,68,68,0.08);padding:6px 8px;border-radius:6px;text-align:center">
            <div style="font-weight:800;font-size:14px;color:#ef4444">${z.crime_count}</div>
            <div style="font-size:10px;color:#64748b;font-weight:600">Crimes</div>
          </div>
          <div style="background:rgba(251,191,36,0.08);padding:6px 8px;border-radius:6px;text-align:center">
            <div style="font-weight:800;font-size:14px;color:#f59e0b">${z.faulty_lights}</div>
            <div style="font-size:10px;color:#64748b;font-weight:600">Faulty Lights</div>
          </div>
        </div>
        <div style="background:rgba(0,0,0,0.04);padding:6px 8px;border-radius:6px;font-size:11px;color:#475569">
          <div style="display:flex;justify-content:space-between;margin-bottom:3px">
            <span>Lighting</span>
            <span style="font-weight:700">${Math.round(z.lighting * 100)}%</span>
          </div>
          <div style="height:4px;background:rgba(0,0,0,0.08);border-radius:2px;overflow:hidden">
            <div style="width:${Math.round(z.lighting * 100)}%;height:100%;background:${z.lighting > 0.6 ? '#34d399' : z.lighting > 0.3 ? '#fbbf24' : '#ef4444'};border-radius:2px"></div>
          </div>
        </div>
        <div style="margin-top:8px;text-align:center">
          <a href="/explore" style="font-size:11px;color:#6366f1;font-weight:600;text-decoration:none">Explore this zone →</a>
        </div>
      </div>`;
  }

  // ── Theme switch support ──
  const themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      setTimeout(() => {
        if (window._homeTileLayer) {
          const isLight = document.documentElement.getAttribute('data-theme') === 'light';
          const url = isLight
            ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
            : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
          window._homeTileLayer.setUrl(url);
        }
      }, 50);
    });
  }

  // ── Init ──
  loadHomeData();
});
