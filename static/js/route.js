/* ══════════════════════════════════════════════════════════════════════════
   Nuit Noire — Explore Page Logic
   Zone-based route planning with smart transport suggestions
   ══════════════════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  const map = NuitMap.createMap('explore-map', { zoom: 12 });

  // Initialize interactive layer system
  if (typeof ExploreLayers !== 'undefined') {
    ExploreLayers.init(map);
  } else {
    NuitMap.loadRiskZones();
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
  const routePriorityEl = document.getElementById('route-priority');
  const voiceRouteBtn = document.getElementById('voice-route-btn');
  const voiceReadRouteBtn = document.getElementById('voice-read-route-btn');
  const cleanModeBtn = document.getElementById('clean-mode-btn');
  const presetRouteOnlyBtn = document.getElementById('preset-route-only-btn');
  const presetAnalyticsViewBtn = document.getElementById('preset-analytics-view-btn');
  const startLocationEl = document.getElementById('start-location');
  const destLocationEl = document.getElementById('dest-location');
  const locationSuggestionsEl = document.getElementById('location-suggestions');

  let zonesList = [];
  let startMarker = null;
  let destMarker  = null;
  let latestAnalysis = null;
  let latestLocationSuggestions = [];
  let isCleanModeEnabled = false;
  let routeAnimationEnabled = true;
  let routeOnlyLocked = false;
  let selectedAltIndex = 0;

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
          const aliasHint = (z.aliases && z.aliases.length) ? ` - ${z.aliases[0]}` : '';
          opt.textContent = `${dot} ${z.name}${aliasHint}`;
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

  let locationSuggestTimer = null;

  async function loadLocationSuggestions(query = '') {
    try {
      const res = await fetch(`/api/location-suggestions?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      const list = data.suggestions || [];
      latestLocationSuggestions = list;
      if (!locationSuggestionsEl) return;
      locationSuggestionsEl.innerHTML = '';
      list.slice(0, 20).forEach((s) => {
        const o = document.createElement('option');
        o.value = s.query_text;
        o.label = `${s.label}`;
        locationSuggestionsEl.appendChild(o);
      });
    } catch {
      // Keep silent for autocomplete errors.
    }
  }

  function scheduleLocationSuggest(value) {
    if (locationSuggestTimer) clearTimeout(locationSuggestTimer);
    locationSuggestTimer = setTimeout(() => loadLocationSuggestions(value || ''), 180);
  }

  if (startLocationEl) {
    startLocationEl.addEventListener('input', () => scheduleLocationSuggest(startLocationEl.value));
  }
  if (destLocationEl) {
    destLocationEl.addEventListener('input', () => scheduleLocationSuggest(destLocationEl.value));
  }
  loadLocationSuggestions('');

  function resolveTypedLocationMeta(text) {
    const target = normalizeName(text);
    if (!target) return null;
    const item = latestLocationSuggestions.find((s) => {
      return normalizeName(s.query_text) === target || normalizeName(s.label) === target;
    });
    return item || null;
  }

  function normalizeName(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, '').trim();
  }

  function findZoneByVoiceName(raw) {
    const target = normalizeName(raw);
    if (!target) return null;

    let exact = zonesList.find(z => normalizeName(z.name) === target);
    if (exact) return exact;

    exact = zonesList.find((z) => (z.aliases || []).some((a) => normalizeName(a) === target));
    if (exact) return exact;

    exact = zonesList.find(z => (
      target.includes(normalizeName(z.name)) || normalizeName(z.name).includes(target) ||
      (z.aliases || []).some((a) => target.includes(normalizeName(a)) || normalizeName(a).includes(target))
    ));
    return exact || null;
  }

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

      if (typeof ExploreLayers !== 'undefined' && ExploreLayers.setRouteFocus) {
        ExploreLayers.setRouteFocus(routeOnlyLocked);
      }

      if (!startZoneEl.value || !destZoneEl.value) {
        const hasStartLocation = startLocationEl && startLocationEl.value.trim();
        const hasDestLocation = destLocationEl && destLocationEl.value.trim();
        if (!hasStartLocation || !hasDestLocation) {
          Nuit.toast('Please provide start and destination (location text or ward)', 'error');
          return;
        }
      }

      const startValue = (startLocationEl && startLocationEl.value.trim()) || startZoneEl.value;
      const destValue = (destLocationEl && destLocationEl.value.trim()) || destZoneEl.value;
      const startMeta = resolveTypedLocationMeta(startValue);
      const destMeta = resolveTypedLocationMeta(destValue);
      if (!startValue || !destValue) {
        Nuit.toast('Please provide start and destination', 'error');
        return;
      }
      if (normalizeName(startValue) === normalizeName(destValue)) {
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
            start_location: startLocationEl ? startLocationEl.value.trim() : '',
            dest_location: destLocationEl ? destLocationEl.value.trim() : '',
            start_lat: startMeta ? startMeta.lat : null,
            start_lng: startMeta ? startMeta.lng : null,
            dest_lat: destMeta ? destMeta.lat : null,
            dest_lng: destMeta ? destMeta.lng : null,
            time: document.getElementById('travel-time').value,
            priority: routePriorityEl ? routePriorityEl.value : 'balanced',
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
    latestAnalysis = data;
    drawRouteAlternatives(data, selectedAltIndex || 0);

    if (typeof ExploreLayers !== 'undefined' && ExploreLayers.setRouteFocus) {
      ExploreLayers.setRouteFocus(true);
    }

    const lvl = data.risk_level.toLowerCase();
    const score = data.risk_score;
    const riskCode = data.risk_code || 0;

    // Build result HTML
    let html = '';

    if (data.resolution) {
      const r = data.resolution;
      const startInput = String(r.start_input || '').trim();
      const destInput = String(r.dest_input || '').trim();
      const startResolved = String(r.start_resolved || '').trim();
      const destResolved = String(r.dest_resolved || '').trim();

      const showStartChip = startInput && normalizeName(startInput) !== normalizeName(startResolved);
      const showDestChip = destInput && normalizeName(destInput) !== normalizeName(destResolved);

      if (showStartChip || showDestChip) {
        html += '<div class="route-resolution-wrap">';
        if (showStartChip) {
          html += `<div class="route-resolution-chip">Start "${Nuit.escapeHtml(startInput)}" resolved near: <strong>${Nuit.escapeHtml(startResolved)}</strong></div>`;
        }
        if (showDestChip) {
          html += `<div class="route-resolution-chip">Destination "${Nuit.escapeHtml(destInput)}" resolved near: <strong>${Nuit.escapeHtml(destResolved)}</strong></div>`;
        }
        html += '</div>';
      }
    }

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

    if (data.route_alternatives && data.route_alternatives.length) {
      html += `
        <div class="suggestions-header" style="margin-top:1rem">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 17h18M3 12h18M3 7h18"/></svg>
          Ranked Route Alternatives (${(data.priority || 'balanced').toUpperCase()})
        </div>
        <div class="route-alt-grid">`;

      data.route_alternatives.forEach((alt, idx) => {
        html += `<div class="route-alt-card rank-${alt.rank} ${idx === 0 ? 'active' : ''}" data-alt-index="${idx}">
          <div class="route-alt-top">
            <span class="route-alt-rank">#${alt.rank}</span>
            <span class="route-alt-title">${alt.title}</span>
            <span class="route-alt-score">${alt.rank_score}</span>
          </div>
          <div class="route-alt-meta">
            <span>Risk ${alt.risk_exposure}</span>
            <span>${alt.time_min} min</span>
            <span>₹${alt.cost_inr}</span>
          </div>
          <div class="route-alt-tradeoff">${(alt.tradeoffs || []).join(' • ')}</div>
        </div>`;
      });

      html += '</div>';
    }

    resultContent.innerHTML = html;
    resultCard.classList.add('visible');
    resultCard.classList.remove('collapsed');

    bindAlternativeCardClicks(data);

    // Collapse the form card to save space, expand result
    if (formCard) formCard.classList.add('collapsed');

    resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function renderEndpointMarkers(data) {
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
  }

  function drawRouteAlternatives(data, focusIdx = null) {
    NuitMap.clearRoutes();
    if (Array.isArray(data.route_alternatives) && data.route_alternatives.length) {
      const activeIdx = focusIdx === null ? 0 : focusIdx;
      selectedAltIndex = activeIdx;
      data.route_alternatives.forEach((alt, idx) => {
        if (routeOnlyLocked && idx !== activeIdx) return;
        if (!Array.isArray(alt.polyline) || alt.polyline.length < 2) return;
        const isFocused = idx === activeIdx;
        NuitMap.drawRoute(alt.polyline, {
          color: alt.color || (idx === 0 ? '#34d399' : idx === 1 ? '#60a5fa' : '#f59e0b'),
          weight: isFocused ? 5 : 2.4,
          opacity: isFocused ? 0.98 : 0.22,
          dash: !isFocused ? '5, 7' : null,
          casingColor: isFocused ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.22)',
          casingOpacity: isFocused ? 0.75 : 0.2,
          glow: isFocused,
          animate: isFocused && routeAnimationEnabled,
        });
      });
      const target = data.route_alternatives[activeIdx] || data.route_alternatives[0];
      if (target && Array.isArray(target.polyline) && target.polyline.length > 1) {
        NuitMap.fitBounds(target.polyline);
      }
      renderEndpointMarkers(data);
      return;
    }

    if (data.unsafe_route) NuitMap.drawRoute(data.unsafe_route, { color: '#f87171', dash: '10, 8', weight: 3, opacity: 0.5 });
    if (data.safe_route) NuitMap.drawRoute(data.safe_route, { color: '#34d399', weight: 4.8, glow: true, animate: true });
    if (data.safe_route) NuitMap.fitBounds(data.safe_route);
    renderEndpointMarkers(data);
  }

  function bindAlternativeCardClicks(data) {
    const cards = resultContent.querySelectorAll('.route-alt-card[data-alt-index]');
    cards.forEach((card) => {
      card.addEventListener('click', () => {
        const idx = Number(card.getAttribute('data-alt-index'));
        if (Number.isNaN(idx)) return;
        cards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        drawRouteAlternatives(data, idx);
      });
    });
  }

  function parseVoiceRouteCommand(transcript) {
    const text = String(transcript || '').trim();
    const patterns = [
      /from\s+(.+?)\s+to\s+(.+?)(?:\s+(?:at|by|around|baje|vajta)\s+(\d{1,2})(?::?(\d{2}))?)?$/i,
      /(.+?)\s+se\s+(.+?)\s+tak(?:\s+(\d{1,2})(?::?(\d{2}))?)?$/i,
      /(.+?)\s+pasun\s+(.+?)\s+paryant(?:\s+(\d{1,2})(?::?(\d{2}))?)?$/i,
    ];
    let m = null;
    for (const p of patterns) {
      m = text.match(p);
      if (m) break;
    }
    if (!m) return null;
    const startRaw = m[1];
    const destRaw = m[2];
    const hh = m[3];
    const mm = m[4] || '00';
    return {
      start: startRaw,
      dest: destRaw,
      time: hh ? `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` : null,
    };
  }

  if (voiceRouteBtn) {
    voiceRouteBtn.addEventListener('click', () => {
      if (!window.NuitVoice || !window.NuitVoice.isSupported()) {
        Nuit.toast('Voice recognition not supported in this browser', 'error');
        return;
      }

      Nuit.toast('Say: from Bandra West to Powai at 22 (or Hindi/Marathi transliteration)', 'info');
      window.NuitVoice.listenOnce({
        onResult: (transcript) => {
          const parsed = parseVoiceRouteCommand(transcript);
          if (!parsed) {
            Nuit.toast('Could not parse command. Try: from Ward A to Ward B at 23', 'error');
            return;
          }

          const start = findZoneByVoiceName(parsed.start);
          const dest = findZoneByVoiceName(parsed.dest);
          if (!start || !dest) {
            if (startLocationEl) startLocationEl.value = parsed.start;
            if (destLocationEl) destLocationEl.value = parsed.dest;
            Nuit.toast('Could not map both places directly; using location text fields', 'info');
          } else {
            startZoneEl.value = start.name;
            destZoneEl.value = dest.name;
            onZoneSelect(startZoneEl, 'start');
            onZoneSelect(destZoneEl, 'dest');
            Nuit.toast(`Voice set: ${start.name} to ${dest.name}`, 'success');
          }

          if (parsed.time) {
            const t = document.getElementById('travel-time');
            if (t) t.value = parsed.time;
          }

          if (!start || !dest) {
            return;
          }
        },
        onError: () => Nuit.toast('Voice recognition failed', 'error'),
      });
    });
  }

  if (voiceReadRouteBtn) {
    voiceReadRouteBtn.addEventListener('click', () => {
      if (!latestAnalysis) {
        Nuit.toast('Run route analysis first', 'info');
        return;
      }
      const best = (latestAnalysis.route_alternatives || [])[0];
      if (!best || !window.NuitVoice || !window.NuitVoice.speak) {
        Nuit.toast('No ranked route available to read out', 'info');
        return;
      }
      const msg = `Best option is ${best.title}. Score ${best.rank_score}. Estimated ${best.time_min} minutes and ${best.cost_inr} rupees. Risk exposure ${best.risk_exposure}.`;
      window.NuitVoice.speak(msg);
    });
  }

  if (cleanModeBtn) {
    cleanModeBtn.addEventListener('click', () => {
      isCleanModeEnabled = !isCleanModeEnabled;
      if (typeof ExploreLayers !== 'undefined' && ExploreLayers.setCleanMode) {
        ExploreLayers.setCleanMode(isCleanModeEnabled);
      }
      cleanModeBtn.classList.toggle('active', isCleanModeEnabled);
      cleanModeBtn.textContent = isCleanModeEnabled ? '🧼 Clean Mode: On' : '🧼 Clean Mode: Off';
      Nuit.toast(isCleanModeEnabled ? 'Clean mode enabled' : 'Clean mode disabled', 'info');
    });
  }

  if (presetRouteOnlyBtn) {
    presetRouteOnlyBtn.addEventListener('click', () => {
      if (!latestAnalysis) {
        Nuit.toast('Run route analysis first', 'info');
        return;
      }
      routeOnlyLocked = true;
      routeAnimationEnabled = true;
      isCleanModeEnabled = true;

      if (typeof ExploreLayers !== 'undefined') {
        if (ExploreLayers.setCleanMode) ExploreLayers.setCleanMode(true);
        if (ExploreLayers.setRouteFocus) ExploreLayers.setRouteFocus(true);
      }
      if (cleanModeBtn) {
        cleanModeBtn.classList.add('active');
        cleanModeBtn.textContent = '🧼 Clean Mode: On';
      }

      drawRouteAlternatives(latestAnalysis, selectedAltIndex || 0);
      Nuit.toast('Route-Only preset enabled', 'success');
    });
  }

  if (presetAnalyticsViewBtn) {
    presetAnalyticsViewBtn.addEventListener('click', () => {
      routeOnlyLocked = false;
      routeAnimationEnabled = false;
      isCleanModeEnabled = false;

      if (typeof ExploreLayers !== 'undefined') {
        if (ExploreLayers.setCleanMode) ExploreLayers.setCleanMode(false);
        if (ExploreLayers.setRouteFocus) ExploreLayers.setRouteFocus(false);
      }
      if (cleanModeBtn) {
        cleanModeBtn.classList.remove('active');
        cleanModeBtn.textContent = '🧼 Clean Mode: Off';
      }

      if (latestAnalysis) {
        drawRouteAlternatives(latestAnalysis, selectedAltIndex || 0);
      }
      Nuit.toast('Analytics View preset enabled', 'success');
    });
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
