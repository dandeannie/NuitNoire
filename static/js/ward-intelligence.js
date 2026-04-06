document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page !== 'ward-intelligence') return;

  const wardSelect = document.getElementById('ward-select');
  const refreshBtn = document.getElementById('ward-refresh-btn');
  const voiceBtn = document.getElementById('ward-voice-btn');
  const roadsBody = document.getElementById('risky-roads-body');
  const cacheSourceEl = document.getElementById('cache-source');
  const cacheLastRefreshEl = document.getElementById('cache-last-refresh');
  const cacheIntervalEl = document.getElementById('cache-interval');
  const cacheStatusDotEl = document.getElementById('cache-status-dot');

  let zones = [];
  let wardMap = null;
  let wardLayer = null;
  let roadLayer = null;
  let hourlyChart = null;
  let monthlyChart = null;

  function toast(msg, type = 'info') {
    if (window.Nuit && typeof window.Nuit.toast === 'function') {
      window.Nuit.toast(msg, type);
    } else {
      console.log(msg);
    }
  }

  function initMap() {
    wardMap = L.map('ward-map', { zoomControl: true, attributionControl: false }).setView([19.076, 72.8777], 11);
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    L.tileLayer(isLight
      ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 17,
      attribution: '&copy; CARTO',
    }).addTo(wardMap);

    wardLayer = L.layerGroup().addTo(wardMap);
    roadLayer = L.layerGroup().addTo(wardMap);
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
  }

  function riskColor(level) {
    if (level === 'high') return '#ef4444';
    if (level === 'medium') return '#f59e0b';
    return '#34d399';
  }

  function normalizeSpeech(text) {
    return String(text || '').toLowerCase().replace(/[^a-z0-9/ ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function timeAgo(iso) {
    if (!iso) return '-';
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return '-';
    const diff = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
    return `${Math.round(diff / 3600)}h ago`;
  }

  async function refreshCacheStatus() {
    try {
      const res = await fetch('/api/cache-status');
      const data = await res.json();
      if (cacheSourceEl) cacheSourceEl.textContent = `source: ${data.source || '-'}`;
      if (cacheLastRefreshEl) cacheLastRefreshEl.textContent = `last refresh: ${timeAgo(data.last_refreshed_at)}`;
      if (cacheIntervalEl) cacheIntervalEl.textContent = `interval: ${data.refresh_interval_seconds || '-'}s`;
      if (cacheStatusDotEl) {
        cacheStatusDotEl.classList.remove('ok', 'warn');
        cacheStatusDotEl.classList.add(data.source === 'live' ? 'ok' : 'warn');
      }
    } catch {
      if (cacheSourceEl) cacheSourceEl.textContent = 'source: unavailable';
      if (cacheStatusDotEl) {
        cacheStatusDotEl.classList.remove('ok');
        cacheStatusDotEl.classList.add('warn');
      }
    }
  }

  function renderKPIs(profile) {
    const zone = profile.zone || {};
    const crime = profile.crime || {};
    const lights = profile.lighting || {};
    const roads = profile.roads || {};

    setText('wk-risk', `${zone.score ?? '-'} (${(zone.risk || '-').toUpperCase()})`);
    setText('wk-crime', crime.count ?? 0);
    setText('wk-night', crime.night_count ?? 0);
    setText('wk-lights', lights.faulty_lights ?? 0);
    setText('wk-roads', roads.segment_count ?? 0);
  }

  function renderRoadTable(profile) {
    const rows = (profile.roads && profile.roads.top_risky) ? profile.roads.top_risky : [];
    roadsBody.innerHTML = '';
    if (!rows.length) {
      roadsBody.innerHTML = '<tr><td colspan="3">No road data available for this ward.</td></tr>';
      return;
    }

    rows.forEach((r) => {
      const tr = document.createElement('tr');
      const risk = Number(r.risk_score || 0);
      const level = risk >= 0.67 ? 'HIGH' : risk >= 0.34 ? 'MED' : 'LOW';
      tr.innerHTML = `<td>${r.name}</td><td>${level} (${risk.toFixed(2)})</td><td>${Math.round(r.length_m || 0)}</td>`;
      roadsBody.appendChild(tr);
    });
  }

  function buildHourlyChart(profile) {
    const ctx = document.getElementById('ward-hourly-chart');
    if (!ctx) return;

    if (hourlyChart) hourlyChart.destroy();
    const hourly = (profile.crime && profile.crime.hourly) ? profile.crime.hourly : [];
    hourlyChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
        datasets: [{
          label: 'Crimes',
          data: hourly,
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239,68,68,0.15)',
          fill: true,
          tension: 0.28,
        }],
      },
      options: { responsive: true, maintainAspectRatio: false },
    });
  }

  function buildMonthlyChart(profile) {
    const ctx = document.getElementById('ward-monthly-chart');
    if (!ctx) return;

    if (monthlyChart) monthlyChart.destroy();
    const crimeMonthly = (profile.crime && profile.crime.monthly) ? profile.crime.monthly : new Array(12).fill(0);
    const accMonthly = (profile.accidents && profile.accidents.monthly) ? profile.accidents.monthly : new Array(12).fill(0);

    monthlyChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
        datasets: [
          { label: 'Crime', data: crimeMonthly, backgroundColor: 'rgba(248,113,113,0.75)' },
          { label: 'Accidents', data: accMonthly, backgroundColor: 'rgba(96,165,250,0.75)' },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false },
    });
  }

  function drawWardGeometry(profile, segments) {
    wardLayer.clearLayers();
    roadLayer.clearLayers();

    const zone = profile.zone || {};
    const color = riskColor(zone.risk);

    if (zone.boundary && zone.boundary.type === 'Polygon' && Array.isArray(zone.boundary.coordinates)) {
      const ring = zone.boundary.coordinates[0] || [];
      const latlngs = ring.filter((p) => Array.isArray(p) && p.length >= 2).map((p) => [p[1], p[0]]);
      if (latlngs.length > 2) {
        const poly = L.polygon(latlngs, {
          color,
          fillColor: color,
          fillOpacity: 0.2,
          weight: 2,
        }).addTo(wardLayer);
        wardMap.fitBounds(poly.getBounds(), { padding: [18, 18] });
      }
    } else if (zone.lat && zone.lng) {
      wardMap.setView([zone.lat, zone.lng], 13);
      L.circleMarker([zone.lat, zone.lng], { radius: 8, color, fillColor: color, fillOpacity: 0.95 }).addTo(wardLayer);
    }

    (segments || []).slice(0, 140).forEach((s) => {
      if (!Array.isArray(s.coords) || s.coords.length < 2) return;
      const segColor = s.risk_level === 'high' ? '#ef4444' : s.risk_level === 'medium' ? '#f59e0b' : '#34d399';
      L.polyline(s.coords || [], {
        color: segColor,
        weight: s.risk_level === 'high' ? 3.2 : 2.2,
        opacity: 0.65,
      }).bindPopup(`${s.name}<br>Risk: ${s.risk_level.toUpperCase()} (${s.risk_score})`).addTo(roadLayer);
    });
  }

  function findWardFromSpeech(transcript) {
    const t = normalizeSpeech(transcript);
    const exact = zones.find((z) => {
      const terms = [z.name, `ward ${z.ward_id}`, ...(z.aliases || [])].map(normalizeSpeech);
      return terms.includes(t);
    });
    if (exact) return exact;

    const wardMatch = t.match(/ward\s+([a-z0-9\/]+)/i);
    if (wardMatch) {
      const wardId = wardMatch[1].toUpperCase();
      return zones.find((z) => (z.ward_id || '').toUpperCase() === wardId) || null;
    }

    const hindiNumbers = { ek: 'A', do: 'B', teen: 'C', char: 'D', paanch: 'E' };
    for (const [word, ward] of Object.entries(hindiNumbers)) {
      if (t.includes(`ward ${word}`) || t === word) {
        const hit = zones.find((z) => (z.ward_id || '').toUpperCase() === ward);
        if (hit) return hit;
      }
    }

    return zones.find((z) => {
      const terms = [z.name, ...(z.aliases || [])].map(normalizeSpeech);
      return terms.some((term) => t.includes(term) || term.includes(t));
    }) || null;
  }

  async function loadWard(wardId) {
    const [profileRes, roadsRes] = await Promise.all([
      fetch(`/api/ward-profile?ward=${encodeURIComponent(wardId)}`),
      fetch(`/api/road-segments?ward=${encodeURIComponent(wardId)}&limit=220`),
    ]);

    const profile = await profileRes.json();
    const roads = await roadsRes.json();

    if (profile.error) {
      toast(profile.error, 'error');
      return;
    }

    renderKPIs(profile);
    renderRoadTable(profile);
    buildHourlyChart(profile);
    buildMonthlyChart(profile);
    drawWardGeometry(profile, roads.segments || []);

    if (window.NuitVoice && window.NuitVoice.speak) {
      window.NuitVoice.speak(`${profile.zone.name}. Risk score ${profile.zone.score}. Peak crime hour ${profile.crime.peak_hour}:00.`);
    }
  }

  async function loadWards() {
    const res = await fetch('/api/zones-list');
    const data = await res.json();
    zones = (data.zones || []).filter((z) => z.ward_id);

    wardSelect.innerHTML = '';
    zones.forEach((z) => {
      const option = document.createElement('option');
      option.value = z.ward_id;
      const alias = (z.aliases && z.aliases[0]) ? ` - ${z.aliases[0]}` : '';
      option.textContent = `${z.name}${alias}`;
      wardSelect.appendChild(option);
    });

    if (zones.length) {
      wardSelect.value = zones[0].ward_id;
      await loadWard(zones[0].ward_id);
    }
  }

  wardSelect.addEventListener('change', () => {
    if (wardSelect.value) loadWard(wardSelect.value);
  });

  refreshBtn.addEventListener('click', async () => {
    refreshBtn.disabled = true;
    try {
      await fetch('/api/refresh-data', { method: 'POST' });
      if (wardSelect.value) await loadWard(wardSelect.value);
      await refreshCacheStatus();
      toast('Data refreshed', 'success');
    } catch {
      toast('Refresh failed', 'error');
    } finally {
      refreshBtn.disabled = false;
    }
  });

  voiceBtn.addEventListener('click', () => {
    if (!window.NuitVoice || !window.NuitVoice.isSupported()) {
      toast('Voice recognition is not supported in this browser.', 'error');
      return;
    }

    toast('Listening: say Ward A, ward ek, Bandra West, or Andheri East', 'info');
    window.NuitVoice.listenOnce({
      onResult: (transcript) => {
        const found = findWardFromSpeech(transcript);
        if (!found) {
          toast(`Could not match ward from: ${transcript}`, 'error');
          return;
        }
        wardSelect.value = found.ward_id;
        loadWard(found.ward_id);
        toast(`Selected ${found.name}`, 'success');
      },
      onError: (err) => toast(err.message, 'error'),
    });
  });

  initMap();
  refreshCacheStatus();
  setInterval(refreshCacheStatus, 15000);
  loadWards().catch(() => toast('Failed to load wards', 'error'));
});
