/* ══════════════════════════════════════════════════════════════════════════
   Nuit Noire — Explore Page Logic
   Zone-based route planning with smart transport suggestions
   ══════════════════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  const map = NuitMap.createMap('explore-map', { zoom: 12 });
  NuitMap.loadRiskZones();

  // Initialize interactive layer system
  if (typeof ExploreLayers !== 'undefined') {
    ExploreLayers.init(map);
  }

  // Ensure map resizes correctly on layout changes (responsive stacked mode)
  const mapEl = document.getElementById('explore-map');
  if (mapEl && window.ResizeObserver) {
    new ResizeObserver(() => { map.invalidateSize(); }).observe(mapEl);
  }

  const startZoneEl = document.getElementById('start-zone');
  const destZoneEl  = document.getElementById('dest-zone');
  const resultCard  = document.getElementById('route-result');
  const resultContent = document.getElementById('route-result-content');
  const form        = document.getElementById('route-form');
  const locateBtn   = document.getElementById('locate-btn');
  const formCard    = document.getElementById('form-card');

  let zonesList = [];
  let startMarker = null;
  let destMarker  = null;

  /* ── Collapsible card toggles ────────────────────────────────────────── */
  document.querySelectorAll('.card-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const card = toggle.closest('.collapsible');
      if (card) card.classList.toggle('collapsed');
    });
  });

  /* ── Load Zones into Dropdowns ───────────────────────────────────────── */
  async function loadZones() {
    try {
      const res = await fetch('/api/zones-list');
      const data = await res.json();
      zonesList = data.zones || [];

      const makeOptions = (sel) => {
        sel.innerHTML = '<option value="">— Choose a neighborhood —</option>';
        zonesList.forEach(z => {
          const opt = document.createElement('option');
          opt.value = z.name;
          const dot = z.risk === 'high' ? '🔴' : z.risk === 'medium' ? '🟡' : '🟢';
          opt.textContent = `${dot} ${z.name}`;
          sel.appendChild(opt);
        });
      };

      makeOptions(startZoneEl);
      makeOptions(destZoneEl);
    } catch {
      Nuit.toast('Failed to load neighborhoods', 'error');
    }
  }
  loadZones();

  /* ── When zone changes, update map marker ────────────────────────────── */
  function onZoneSelect(sel, role) {
    const zone = zonesList.find(z => z.name === sel.value);
    if (!zone) return;
    const marker = NuitMap.addMarker(zone.lat, zone.lng, {
      color: role === 'start' ? '#818cf8' : '#ec4899',
      popup: `<strong>${role === 'start' ? 'Start' : 'Destination'}:</strong> ${zone.name}`,
    });
    if (role === 'start') {
      if (startMarker) NuitMap.getMap().removeLayer(startMarker);
      startMarker = marker;
    } else {
      if (destMarker) NuitMap.getMap().removeLayer(destMarker);
      destMarker = marker;
    }
    NuitMap.setView(zone.lat, zone.lng, 13);
  }

  startZoneEl.addEventListener('change', () => onZoneSelect(startZoneEl, 'start'));
  destZoneEl.addEventListener('change', () => onZoneSelect(destZoneEl, 'dest'));

  /* ── Click map zone → auto-select in dropdown ───────────────────────── */
  NuitMap.onMapClick((mode, latlng) => {
    const nearest = findNearestZone(latlng.lat, latlng.lng);
    if (!nearest) return;
    // Fill the first empty dropdown, or the start one
    if (!startZoneEl.value) {
      startZoneEl.value = nearest.name;
      onZoneSelect(startZoneEl, 'start');
      Nuit.toast(`Start: ${nearest.name}`, 'info');
    } else if (!destZoneEl.value) {
      destZoneEl.value = nearest.name;
      onZoneSelect(destZoneEl, 'dest');
      Nuit.toast(`Destination: ${nearest.name}`, 'info');
    } else {
      startZoneEl.value = nearest.name;
      onZoneSelect(startZoneEl, 'start');
      Nuit.toast(`Start changed: ${nearest.name}`, 'info');
    }
  });

  function findNearestZone(lat, lng) {
    let best = null, bestDist = Infinity;
    zonesList.forEach(z => {
      const d = Math.sqrt((z.lat - lat) ** 2 + (z.lng - lng) ** 2);
      if (d < bestDist) { bestDist = d; best = z; }
    });
    return best;
  }

  /* ── Geolocation ─────────────────────────────────────────────────────── */
  if (locateBtn) {
    locateBtn.addEventListener('click', () => {
      if (!navigator.geolocation) {
        Nuit.toast('Geolocation not supported', 'error');
        return;
      }
      locateBtn.disabled = true;
      locateBtn.textContent = '⏳ Detecting...';

      navigator.geolocation.getCurrentPosition(
        pos => {
          const nearest = findNearestZone(pos.coords.latitude, pos.coords.longitude);
          if (nearest) {
            startZoneEl.value = nearest.name;
            onZoneSelect(startZoneEl, 'start');
            Nuit.toast(`You're nearest to ${nearest.name}`, 'success');
          }
          locateBtn.textContent = '📍 Detected!';
          setTimeout(() => {
            locateBtn.textContent = '📍 Detect My Location';
            locateBtn.disabled = false;
          }, 2000);
        },
        () => {
          locateBtn.textContent = '📍 Detect My Location';
          locateBtn.disabled = false;
          Nuit.toast('Could not get your location', 'error');
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }

  /* ── Route Form Submit ───────────────────────────────────────────────── */
  if (form) {
    form.addEventListener('submit', async e => {
      e.preventDefault();

      if (!startZoneEl.value || !destZoneEl.value) {
        Nuit.toast('Please select both start and destination', 'error');
        return;
      }
      if (startZoneEl.value === destZoneEl.value) {
        Nuit.toast('Start and destination must be different', 'error');
        return;
      }

      const btn = form.querySelector('button[type="submit"]');
      const origText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="btn-spinner"></span> Checking route...';

      try {
        const res = await fetch('/api/analyze-route', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            start_zone: startZoneEl.value,
            dest_zone: destZoneEl.value,
            time: document.getElementById('travel-time').value,
          }),
        });
        const data = await res.json();
        if (data.error) { Nuit.toast(data.error, 'error'); return; }
        renderRouteResult(data);
      } catch {
        Nuit.toast('Route analysis failed', 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = origText;
      }
    });
  }

  /* ── Render Result ───────────────────────────────────────────────────── */
  function renderRouteResult(data) {
    NuitMap.clearRoutes();

    // Draw routes on map
    if (data.unsafe_route) NuitMap.drawRoute(data.unsafe_route, { color: '#f87171', dash: '10, 8', weight: 3, opacity: 0.5 });
    if (data.safe_route) NuitMap.drawRoute(data.safe_route, { color: '#34d399', weight: 4 });
    if (data.safe_route) NuitMap.fitBounds(data.safe_route);

    // Place markers
    if (data.start_zone) {
      if (startMarker) NuitMap.getMap().removeLayer(startMarker);
      startMarker = NuitMap.addMarker(data.start_zone.lat, data.start_zone.lng, {
        color: '#818cf8', popup: `<strong>Start:</strong> ${data.start_zone.name}`,
      });
    }
    if (data.dest_zone) {
      if (destMarker) NuitMap.getMap().removeLayer(destMarker);
      destMarker = NuitMap.addMarker(data.dest_zone.lat, data.dest_zone.lng, {
        color: '#ec4899', popup: `<strong>Destination:</strong> ${data.dest_zone.name}`,
      });
    }

    const lvl = data.risk_level.toLowerCase();
    const score = data.risk_score;
    const riskCode = data.risk_code || 0;

    // Build result HTML
    let html = '';

    // Risk header section
    html += `
      <div class="route-risk-header ${lvl}">
        <div class="route-risk-score">${score}%</div>
        <div class="route-risk-info">
          <span class="badge badge-${lvl}">${data.risk_level} Risk</span>
          <div class="route-risk-subtitle">${data.start_zone.name} → ${data.dest_zone.name}</div>
        </div>
      </div>`;

    // Reasons
    if (data.reasons && data.reasons.length) {
      html += '<div class="route-reasons">';
      data.reasons.forEach(r => { html += `<div class="route-reason-item">⚠️ ${r}</div>`; });
      html += '</div>';
    }

    // Feature tags
    if (data.features) {
      const f = data.features;
      html += `<div class="route-features">
        <span class="feature-tag">💡 Light: ${f.lighting_level}</span>
        <span class="feature-tag">🚗 Traffic: ${f.traffic_density}</span>
        <span class="feature-tag">📍 ${f.area_type}</span>
        <span class="feature-tag">🕐 ${f.time_hour}:00</span>
      </div>`;
    }

    // ── If route is safe ──
    if (riskCode === 0) {
      html += `
        <div class="route-safe-banner">
          <div class="safe-icon">✅</div>
          <div>
            <strong>Your route looks safe!</strong><br>
            <span style="font-size:0.78rem;color:var(--text-dim)">You can walk comfortably between these areas at this time.</span>
          </div>
        </div>`;
    }

    // ── If route is risky → show transport suggestions ──
    if (data.suggestions && data.suggestions.length) {
      html += `
        <div class="suggestions-header">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
          Safer Travel Options
        </div>
        <div class="suggestions-grid">`;

      data.suggestions.forEach((s, i) => {
        const icon = getTransportIcon(s.type);
        const safetyClass = s.safety === 'high' ? 'high' : s.safety === 'medium' ? 'medium' : 'low';

        html += `<div class="suggestion-card" style="animation-delay:${i * 0.1}s">`;
        html += `<div class="suggestion-header">
          <span class="suggestion-icon">${icon}</span>
          <span class="suggestion-title">${s.title}</span>
          <span class="suggestion-safety safety-${safetyClass}">${s.safety} safety</span>
        </div>`;

        html += `<div class="suggestion-body">${s.detail || ''}</div>`;

        // Transit steps
        if (s.steps && s.steps.length) {
          html += '<div class="suggestion-steps">';
          s.steps.forEach(step => {
            const busLower = (step.bus || '').toLowerCase();
            const stepIcon = busLower.includes('walk') ? '🚶' : (busLower.includes('line') ? '🚆' : '🚌');
            const riskClass = step.risk === 'high' ? 'high' : step.risk === 'medium' ? 'medium' : 'low';
            html += `<div class="step-item">
              <span class="step-icon">${stepIcon}</span>
              <div class="step-detail">
                <strong>${step.from} → ${step.to}</strong>
                <span class="step-meta">${step.bus} · ₹${step.fare} · ${step.time} min</span>
                ${step.risk === 'high' ? '<span class="step-warning">⚠️ This area has higher risk — stay alert</span>' : ''}
              </div>
              <span class="step-risk risk-${riskClass}"></span>
            </div>`;
          });
          html += '</div>';
        }

        // Cost + time footer
        html += `<div class="suggestion-footer">`;
        if (s.cost) html += `<span class="suggestion-cost">₹${s.cost}</span>`;
        if (s.time) html += `<span class="suggestion-time">~${s.time} min</span>`;
        if (s.distance) html += `<span class="suggestion-distance">${s.distance} km</span>`;
        html += `</div>`;

        html += `</div>`; // end suggestion-card
      });

      html += '</div>'; // end suggestions-grid
    }

    resultContent.innerHTML = html;
    resultCard.classList.add('visible');
    resultCard.classList.remove('collapsed');

    // Collapse the form card to save space, expand result
    if (formCard) formCard.classList.add('collapsed');

    resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function getTransportIcon(type) {
    switch (type) {
      case 'taxi': return '🚕';
      case 'auto': return '🛺';
      case 'transit': return '🚌';
      case 'walk': return '🚶';
      default: return '🚗';
    }
  }
});
