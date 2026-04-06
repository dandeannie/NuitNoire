import os
import sqlite3
import math
import random
from datetime import datetime, timezone

import numpy as np
import joblib
from flask import Flask, request, jsonify, render_template, g

# ── Config ──────────────────────────────────────────────────────────────────

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE = os.path.join(BASE_DIR, 'database', 'reports.db')
MODEL_PATH = os.path.join(BASE_DIR, 'model', 'model.pkl')

app = Flask(__name__)
app.secret_key = os.urandom(32)

ADMIN_USER = 'admin'
ADMIN_PASS = 'nuitnoire2026'

AREA_MAP = {'urban': 0, 'suburban': 1, 'rural': 2}
RISK_LABELS = {0: 'Low', 1: 'Medium', 2: 'High'}
ALLOWED_ISSUES = {'broken_light', 'suspicious_activity', 'unsafe_road', 'other'}
ALLOWED_STATUSES = {'pending', 'investigating', 'resolved'}

# Mumbai / Maharashtra risk zones — extended with transport & environmental data
MUMBAI_ZONES = [
    {'lat': 18.9067, 'lng': 72.8147, 'risk': 'low',    'name': 'Colaba',              'score': 20, 'area': 'urban',    'lighting': 0.82, 'traffic': 0.70, 'accidents': 0},
    {'lat': 19.0596, 'lng': 72.8295, 'risk': 'low',    'name': 'Bandra West',         'score': 22, 'area': 'urban',    'lighting': 0.78, 'traffic': 0.75, 'accidents': 0},
    {'lat': 19.1197, 'lng': 72.8468, 'risk': 'medium', 'name': 'Andheri East',        'score': 55, 'area': 'urban',    'lighting': 0.40, 'traffic': 0.50, 'accidents': 1},
    {'lat': 19.1075, 'lng': 72.8263, 'risk': 'low',    'name': 'Juhu',                'score': 18, 'area': 'urban',    'lighting': 0.80, 'traffic': 0.65, 'accidents': 0},
    {'lat': 19.0178, 'lng': 72.8478, 'risk': 'medium', 'name': 'Dadar',               'score': 48, 'area': 'urban',    'lighting': 0.45, 'traffic': 0.55, 'accidents': 1},
    {'lat': 19.0176, 'lng': 72.8153, 'risk': 'medium', 'name': 'Worli',               'score': 42, 'area': 'urban',    'lighting': 0.50, 'traffic': 0.60, 'accidents': 1},
    {'lat': 19.1176, 'lng': 72.9060, 'risk': 'low',    'name': 'Powai',               'score': 24, 'area': 'suburban', 'lighting': 0.72, 'traffic': 0.55, 'accidents': 0},
    {'lat': 19.0726, 'lng': 72.8794, 'risk': 'high',   'name': 'Kurla',               'score': 78, 'area': 'urban',    'lighting': 0.15, 'traffic': 0.20, 'accidents': 2},
    {'lat': 19.2183, 'lng': 72.9781, 'risk': 'medium', 'name': 'Thane West',          'score': 52, 'area': 'suburban', 'lighting': 0.42, 'traffic': 0.45, 'accidents': 1},
    {'lat': 19.0771, 'lng': 73.0071, 'risk': 'medium', 'name': 'Vashi, Navi Mumbai',  'score': 45, 'area': 'suburban', 'lighting': 0.55, 'traffic': 0.50, 'accidents': 1},
    {'lat': 19.2307, 'lng': 72.8567, 'risk': 'medium', 'name': 'Borivali',            'score': 50, 'area': 'suburban', 'lighting': 0.44, 'traffic': 0.48, 'accidents': 1},
    {'lat': 19.1874, 'lng': 72.8484, 'risk': 'medium', 'name': 'Malad West',          'score': 53, 'area': 'suburban', 'lighting': 0.38, 'traffic': 0.42, 'accidents': 1},
    {'lat': 19.1663, 'lng': 72.8526, 'risk': 'medium', 'name': 'Goregaon',            'score': 47, 'area': 'urban',    'lighting': 0.48, 'traffic': 0.52, 'accidents': 1},
    {'lat': 19.1106, 'lng': 72.9303, 'risk': 'high',   'name': 'Vikhroli',            'score': 72, 'area': 'suburban', 'lighting': 0.18, 'traffic': 0.22, 'accidents': 2},
    {'lat': 19.0522, 'lng': 72.8994, 'risk': 'high',   'name': 'Chembur',             'score': 75, 'area': 'suburban', 'lighting': 0.15, 'traffic': 0.18, 'accidents': 2},
    {'lat': 19.0432, 'lng': 72.8527, 'risk': 'high',   'name': 'Dharavi',             'score': 85, 'area': 'urban',    'lighting': 0.10, 'traffic': 0.12, 'accidents': 2},
    {'lat': 18.9984, 'lng': 72.8311, 'risk': 'low',    'name': 'Lower Parel',         'score': 19, 'area': 'urban',    'lighting': 0.85, 'traffic': 0.72, 'accidents': 0},
    {'lat': 18.9338, 'lng': 72.8354, 'risk': 'low',    'name': 'Fort',                'score': 15, 'area': 'urban',    'lighting': 0.88, 'traffic': 0.80, 'accidents': 0},
    {'lat': 18.9432, 'lng': 72.8235, 'risk': 'low',    'name': 'Marine Drive',        'score': 12, 'area': 'urban',    'lighting': 0.92, 'traffic': 0.85, 'accidents': 0},
    {'lat': 19.0860, 'lng': 72.9080, 'risk': 'high',   'name': 'Ghatkopar',           'score': 70, 'area': 'urban',    'lighting': 0.20, 'traffic': 0.25, 'accidents': 2},
]

# Quick lookup by name (case-insensitive)
ZONE_INDEX = {z['name'].lower(): z for z in MUMBAI_ZONES}

# Bus routes connecting zones (realistic Mumbai bus/metro connections)
MUMBAI_TRANSPORT = [
    {'from': 'Colaba',       'to': 'Fort',          'bus': 'BEST 3',       'fare': 10,  'time': 12},
    {'from': 'Fort',         'to': 'Marine Drive',  'bus': 'Walk (0.8km)', 'fare': 0,   'time': 10},
    {'from': 'Fort',         'to': 'Dadar',         'bus': 'Central Line',  'fare': 10,  'time': 18},
    {'from': 'Marine Drive', 'to': 'Lower Parel',   'bus': 'BEST 83',      'fare': 10,  'time': 15},
    {'from': 'Lower Parel',  'to': 'Worli',         'bus': 'BEST 24',      'fare': 8,   'time': 10},
    {'from': 'Worli',        'to': 'Bandra West',   'bus': 'BEST 354',     'fare': 12,  'time': 20},
    {'from': 'Worli',        'to': 'Dadar',         'bus': 'BEST 18',      'fare': 8,   'time': 12},
    {'from': 'Dadar',        'to': 'Bandra West',   'bus': 'Western Line',  'fare': 10,  'time': 10},
    {'from': 'Dadar',        'to': 'Kurla',         'bus': 'Harbour Line',  'fare': 10,  'time': 12},
    {'from': 'Dadar',        'to': 'Andheri East',  'bus': 'Western Line',  'fare': 15,  'time': 22},
    {'from': 'Bandra West',  'to': 'Juhu',          'bus': 'BEST 211',     'fare': 8,   'time': 15},
    {'from': 'Bandra West',  'to': 'Andheri East',  'bus': 'Western Line',  'fare': 10,  'time': 15},
    {'from': 'Andheri East', 'to': 'Goregaon',      'bus': 'Western Line',  'fare': 10,  'time': 10},
    {'from': 'Andheri East', 'to': 'Powai',         'bus': 'BEST 398',     'fare': 12,  'time': 25},
    {'from': 'Andheri East', 'to': 'Vikhroli',      'bus': 'BEST 332',     'fare': 12,  'time': 20},
    {'from': 'Goregaon',     'to': 'Malad West',    'bus': 'Western Line',  'fare': 5,   'time': 8},
    {'from': 'Goregaon',     'to': 'Borivali',      'bus': 'Western Line',  'fare': 10,  'time': 14},
    {'from': 'Malad West',   'to': 'Borivali',      'bus': 'Western Line',  'fare': 5,   'time': 8},
    {'from': 'Kurla',        'to': 'Ghatkopar',     'bus': 'BEST 504',     'fare': 8,   'time': 15},
    {'from': 'Kurla',        'to': 'Chembur',       'bus': 'Harbour Line',  'fare': 10,  'time': 10},
    {'from': 'Ghatkopar',    'to': 'Vikhroli',      'bus': 'BEST 525',     'fare': 8,   'time': 12},
    {'from': 'Ghatkopar',    'to': 'Powai',         'bus': 'BEST 371',     'fare': 10,  'time': 18},
    {'from': 'Chembur',      'to': 'Vashi, Navi Mumbai', 'bus': 'Trans-Harbour', 'fare': 20, 'time': 25},
    {'from': 'Kurla',        'to': 'Dharavi',       'bus': 'Walk (1km)',    'fare': 0,   'time': 12},
    {'from': 'Thane West',   'to': 'Borivali',      'bus': 'BEST 309',     'fare': 25,  'time': 40},
    {'from': 'Thane West',   'to': 'Ghatkopar',     'bus': 'Central Line',  'fare': 15,  'time': 20},
    {'from': 'Powai',        'to': 'Vikhroli',      'bus': 'BEST 405',     'fare': 8,   'time': 12},
    {'from': 'Colaba',       'to': 'Lower Parel',   'bus': 'BEST 83',      'fare': 12,  'time': 20},
    {'from': 'Dharavi',      'to': 'Dadar',         'bus': 'BEST 174',     'fare': 8,   'time': 10},
]

# Default center: Mumbai
DEFAULT_LAT = 19.0760
DEFAULT_LNG = 72.8777

# ── Database ────────────────────────────────────────────────────────────────

def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(DATABASE)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop('db', None)
    if db:
        db.close()


def init_db():
    os.makedirs(os.path.dirname(DATABASE), exist_ok=True)
    conn = sqlite3.connect(DATABASE)
    conn.execute('''CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        location TEXT NOT NULL,
        latitude REAL,
        longitude REAL,
        issue_type TEXT NOT NULL,
        description TEXT,
        timestamp TEXT NOT NULL,
        status TEXT DEFAULT 'pending'
    )''')
    conn.commit()
    conn.close()


# ── ML Model ───────────────────────────────────────────────────────────────

model = None


def load_model():
    global model
    if os.path.exists(MODEL_PATH):
        model = joblib.load(MODEL_PATH)
    else:
        print(f"[warn] Model not found at {MODEL_PATH} — run model/train_model.py")


def predict_risk(lighting, traffic, accident_hist, area_type, time_hour):
    area_enc = AREA_MAP.get(area_type, 0)
    features = np.array([[lighting, traffic, area_enc, time_hour, accident_hist]])

    if model is not None:
        pred = int(model.predict(features)[0])
        proba = model.predict_proba(features)[0]
        score = round(float(max(proba)) * 100, 1)
    else:
        raw = ((1 - lighting) * 30 + (1 - traffic) * 25
               + accident_hist * 20 + area_enc * 15
               + (10 if time_hour < 5 else 0))
        pred = 2 if raw > 60 else (1 if raw > 35 else 0)
        score = round(raw, 1)

    return pred, score


def explain_risk(lighting, traffic, accident_hist, area_type, time_hour):
    reasons = []
    if lighting < 0.3:
        reasons.append('Very poor street lighting')
    elif lighting < 0.5:
        reasons.append('Below-average lighting conditions')
    if traffic < 0.2:
        reasons.append('Isolated area with minimal traffic')
    elif traffic < 0.4:
        reasons.append('Light traffic — fewer eyes on the street')
    if accident_hist >= 2:
        reasons.append('High prior accident frequency nearby')
    elif accident_hist >= 1:
        reasons.append('Some accident history recorded')
    if area_type in ('rural', 'suburban'):
        reasons.append(f'{area_type.capitalize()} zone — limited surveillance')
    if 0 <= time_hour < 5:
        reasons.append('Deep-night hours (00:00–05:00)')
    return reasons or ['No significant risk factors detected']


def make_route(lat1, lon1, lat2, lon2, pts=8, offset=0.0):
    coords = []
    for i in range(pts + 1):
        t = i / pts
        lat = lat1 + (lat2 - lat1) * t + offset * math.sin(math.pi * t)
        lon = lon1 + (lon2 - lon1) * t + offset * math.cos(math.pi * t) * 0.5
        coords.append([round(lat, 6), round(lon, 6)])
    return coords


# ── Pages ───────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/explore')
def explore():
    return render_template('explore.html')

@app.route('/predict')
def predict():
    return render_template('predict.html')

@app.route('/analytics')
def analytics():
    return render_template('analytics.html')

@app.route('/report')
def report():
    return render_template('report.html')

@app.route('/about')
def about():
    return render_template('about.html')


# ── API ─────────────────────────────────────────────────────────────────────

def find_zone(name):
    """Look up a zone by name (case-insensitive)."""
    return ZONE_INDEX.get(name.strip().lower())


def find_nearest_zone(lat, lng):
    """Return the zone closest to given coordinates."""
    best, best_d = None, float('inf')
    for z in MUMBAI_ZONES:
        d = (z['lat'] - lat) ** 2 + (z['lng'] - lng) ** 2
        if d < best_d:
            best, best_d = z, d
    return best


def find_safe_route(start_zone, dest_zone, time_hour):
    """Build smart transport suggestions through safe intermediate zones."""
    suggestions = []
    start_name = start_zone['name']
    dest_name = dest_zone['name']

    # Build adjacency from transport data (bidirectional)
    adj = {}
    for t in MUMBAI_TRANSPORT:
        adj.setdefault(t['from'], []).append(t)
        adj.setdefault(t['to'], []).append({
            'from': t['to'], 'to': t['from'],
            'bus': t['bus'], 'fare': t['fare'], 'time': t['time'],
        })

    # BFS to find a path through safer zones
    from collections import deque
    visited = {start_name}
    queue = deque([(start_name, [])])
    path_found = None

    while queue:
        current, path = queue.popleft()
        if current == dest_name:
            path_found = path
            break
        for link in adj.get(current, []):
            nxt = link['to']
            if nxt not in visited:
                visited.add(nxt)
                queue.append((nxt, path + [link]))

    # Calculate distance for taxi cost estimation
    dist_km = round(math.sqrt(
        (start_zone['lat'] - dest_zone['lat']) ** 2 +
        (start_zone['lng'] - dest_zone['lng']) ** 2
    ) * 111, 1)  # rough km conversion

    taxi_cost = max(25, round(23 + dist_km * 14))  # Mumbai taxi meter
    auto_cost = max(18, round(18 + dist_km * 11))

    # 1) Direct taxi suggestion (always include)
    suggestions.append({
        'type': 'taxi',
        'icon': '🚕',
        'title': f'Take a taxi from {start_name} to {dest_name}',
        'detail': f'~{dist_km} km · Estimated ₹{taxi_cost} · Safest option at night',
        'cost': taxi_cost,
        'time': max(8, round(dist_km * 3.5)),
        'safety': 'high',
    })

    # 2) Auto rickshaw (if distance < 15km)
    if dist_km < 15:
        suggestions.append({
            'type': 'auto',
            'icon': '🛺',
            'title': f'Auto rickshaw {start_name} → {dest_name}',
            'detail': f'~{dist_km} km · Estimated ₹{auto_cost} · Available 24/7',
            'cost': auto_cost,
            'time': max(10, round(dist_km * 4)),
            'safety': 'medium',
        })

    # 3) Bus/train path (if found and meaningful)
    if path_found and len(path_found) <= 4:
        total_fare = sum(l['fare'] for l in path_found)
        total_time = sum(l['time'] for l in path_found)
        stops = [start_name] + [l['to'] for l in path_found]
        steps = []
        for link in path_found:
            via_zone = find_zone(link['to'])
            risk_tag = via_zone['risk'] if via_zone else 'medium'
            steps.append({
                'from': link['from'],
                'to': link['to'],
                'bus': link['bus'],
                'fare': link['fare'],
                'time': link['time'],
                'risk': risk_tag,
            })

        # Check if any step goes through high-risk zone
        has_risky_step = any(s['risk'] == 'high' for s in steps)

        suggestions.append({
            'type': 'transit',
            'icon': '🚌',
            'title': f'Public transit: {" → ".join(stops)}',
            'detail': f'Total ₹{total_fare} · ~{total_time} min · {len(steps)} segment(s)',
            'cost': total_fare,
            'time': total_time,
            'safety': 'low' if has_risky_step else ('medium' if total_time > 30 else 'high'),
            'steps': steps,
            'warning': 'Route passes through a high-risk zone' if has_risky_step else None,
        })

    # 4) Walking (only if short and low-risk)
    if dist_km < 3 and start_zone['risk'] == 'low' and dest_zone['risk'] == 'low':
        suggestions.append({
            'type': 'walk',
            'icon': '🚶',
            'title': f'Walk from {start_name} to {dest_name}',
            'detail': f'~{dist_km} km · {max(8, round(dist_km * 13))} min · Both areas are well-lit',
            'cost': 0,
            'time': max(8, round(dist_km * 13)),
            'safety': 'high',
        })
    elif dist_km < 2:
        walk_time = max(5, round(dist_km * 13))
        safety = 'medium' if start_zone['risk'] != 'high' and dest_zone['risk'] != 'high' else 'low'
        suggestions.append({
            'type': 'walk',
            'icon': '🚶',
            'title': f'Walk from {start_name} to {dest_name}',
            'detail': f'~{dist_km} km · {walk_time} min · {"Use caution, poorly lit areas" if safety == "low" else "Moderate lighting"}',
            'cost': 0,
            'time': walk_time,
            'safety': safety,
        })

    return suggestions


@app.route('/api/analyze-route', methods=['POST'])
def api_analyze_route():
    data = request.get_json(force=True)
    start_name = str(data.get('start_zone', '')).strip()
    dest_name = str(data.get('dest_zone', '')).strip()
    time_val = data.get('time', 23)

    try:
        time_hour = int(str(time_val).split(':')[0]) if ':' in str(time_val) else int(time_val)
    except (ValueError, TypeError):
        time_hour = 23
    time_hour = max(0, min(23, time_hour))

    # Resolve zones by name
    start_zone = find_zone(start_name)
    dest_zone = find_zone(dest_name)
    if not start_zone or not dest_zone:
        return jsonify({'error': 'Unknown zone name(s)'}), 400

    lat1, lon1 = start_zone['lat'], start_zone['lng']
    lat2, lon2 = dest_zone['lat'], dest_zone['lng']

    # Use actual zone data for risk analysis
    lighting = start_zone.get('lighting', 0.3)
    traffic = start_zone.get('traffic', 0.3)
    acc_hist = start_zone.get('accidents', 1)
    area = start_zone.get('area', 'urban')

    risk_level, risk_score = predict_risk(lighting, traffic, acc_hist, area, time_hour)
    reasons = explain_risk(lighting, traffic, acc_hist, area, time_hour)

    # Generate smart suggestions if route is risky
    suggestions = []
    if risk_level >= 1:  # medium or high
        suggestions = find_safe_route(start_zone, dest_zone, time_hour)

    return jsonify({
        'risk_level': RISK_LABELS[risk_level],
        'risk_score': risk_score,
        'risk_code': risk_level,
        'reasons': reasons,
        'start_zone': {'name': start_zone['name'], 'lat': lat1, 'lng': lon1, 'risk': start_zone['risk'], 'score': start_zone['score']},
        'dest_zone':  {'name': dest_zone['name'],  'lat': lat2, 'lng': lon2, 'risk': dest_zone['risk'],  'score': dest_zone['score']},
        'features': {
            'lighting_level': lighting,
            'traffic_density': traffic,
            'accident_history': acc_hist,
            'area_type': area,
            'time_hour': time_hour,
        },
        'unsafe_route': make_route(lat1, lon1, lat2, lon2),
        'safe_route': make_route(lat1, lon1, lat2, lon2, offset=0.003),
        'suggestions': suggestions,
    })


@app.route('/api/zone-predict', methods=['POST'])
def api_zone_predict():
    """Predict risk for a specific zone by name."""
    data = request.get_json(force=True)
    zone_name = str(data.get('zone', '')).strip()
    time_hour = max(0, min(23, int(data.get('time', 23))))

    zone = find_zone(zone_name)
    if not zone:
        return jsonify({'error': 'Unknown zone'}), 400

    lighting = zone.get('lighting', 0.3)
    traffic = zone.get('traffic', 0.3)
    acc_hist = zone.get('accidents', 1)
    area = zone.get('area', 'urban')

    risk_level, risk_score = predict_risk(lighting, traffic, acc_hist, area, time_hour)
    reasons = explain_risk(lighting, traffic, acc_hist, area, time_hour)

    return jsonify({
        'zone': zone['name'],
        'risk_level': RISK_LABELS[risk_level],
        'risk_code': risk_level,
        'risk_score': risk_score,
        'reasons': reasons,
        'zone_data': {
            'lighting': lighting,
            'traffic': traffic,
            'accidents': acc_hist,
            'area': area,
            'base_score': zone['score'],
        },
    })


@app.route('/api/predict-risk', methods=['POST'])
def api_predict_risk():
    data = request.get_json(force=True)
    lighting = max(0.0, min(1.0, float(data.get('lighting_level', 0.5))))
    traffic = max(0.0, min(1.0, float(data.get('traffic_density', 0.5))))
    acc_hist = max(0, min(2, int(data.get('accident_history', 0))))
    area = data.get('area_type', 'urban')
    if area not in AREA_MAP:
        area = 'urban'
    time_hour = max(0, min(23, int(data.get('time', 22))))

    risk_level, risk_score = predict_risk(lighting, traffic, acc_hist, area, time_hour)
    reasons = explain_risk(lighting, traffic, acc_hist, area, time_hour)

    return jsonify({
        'risk_level': RISK_LABELS[risk_level],
        'risk_code': risk_level,
        'risk_score': risk_score,
        'reasons': reasons,
    })


@app.route('/api/report-incident', methods=['POST'])
def api_report_incident():
    data = request.get_json(force=True)
    location = str(data.get('location', '')).strip()
    lat = data.get('latitude')
    lng = data.get('longitude')
    issue = str(data.get('issue_type', '')).strip()
    desc = str(data.get('description', '')).strip()[:500]

    if not location or not issue:
        return jsonify({'error': 'location and issue_type required'}), 400
    if issue not in ALLOWED_ISSUES:
        return jsonify({'error': 'Invalid issue_type'}), 400

    db = get_db()
    db.execute(
        'INSERT INTO reports (location,latitude,longitude,issue_type,description,timestamp) VALUES (?,?,?,?,?,?)',
        (location, lat, lng, issue, desc, datetime.now(timezone.utc).isoformat()),
    )
    db.commit()
    return jsonify({'ok': True, 'message': 'Incident reported'})


@app.route('/api/admin/reports')
def api_admin_reports():
    db = get_db()
    rows = db.execute('SELECT * FROM reports ORDER BY timestamp DESC LIMIT 200').fetchall()
    return jsonify({'reports': [dict(r) for r in rows], 'count': len(rows)})


@app.route('/api/admin/update-report', methods=['POST'])
def api_admin_update_report():
    data = request.get_json(force=True)
    rid = data.get('id')
    status = data.get('status', 'resolved')
    if not rid:
        return jsonify({'error': 'id required'}), 400
    if status not in ALLOWED_STATUSES:
        return jsonify({'error': 'Invalid status'}), 400
    db = get_db()
    db.execute('UPDATE reports SET status=? WHERE id=?', (status, int(rid)))
    db.commit()
    return jsonify({'ok': True})


@app.route('/api/risk-zones')
def api_risk_zones():
    return jsonify({'zones': [
        {k: z[k] for k in ('lat', 'lng', 'risk', 'name', 'score')} for z in MUMBAI_ZONES
    ]})


@app.route('/api/zones-list')
def api_zones_list():
    """Return sorted zone names for dropdowns with full data."""
    return jsonify({'zones': sorted(
        [{'name': z['name'], 'risk': z['risk'], 'score': z['score'],
          'lat': z['lat'], 'lng': z['lng'],
          'lighting': z.get('lighting', 0.5), 'traffic': z.get('traffic', 0.5),
          'accidents': z.get('accidents', 1), 'area': z.get('area', 'urban'),
          } for z in MUMBAI_ZONES],
        key=lambda x: x['name'],
    )})


@app.route('/api/insights-data')
def api_insights_data():
    high_zones = [z for z in MUMBAI_ZONES if z['risk'] == 'high']
    med_zones  = [z for z in MUMBAI_ZONES if z['risk'] == 'medium']
    low_zones  = [z for z in MUMBAI_ZONES if z['risk'] == 'low']
    avg_score  = round(sum(z['score'] for z in MUMBAI_ZONES) / len(MUMBAI_ZONES), 1)
    total_accidents = sum(z.get('accidents', 0) for z in MUMBAI_ZONES)

    return jsonify({
        # KPI summary data
        'kpis': {
            'total_zones': len(MUMBAI_ZONES),
            'high_risk': len(high_zones),
            'medium_risk': len(med_zones),
            'low_risk': len(low_zones),
            'avg_score': avg_score,
            'total_incidents': total_accidents,
            'peak_hour': 1,
            'peak_hour_label': '01:00 AM',
            'safest_zone': min(MUMBAI_ZONES, key=lambda z: z['score'])['name'],
            'most_dangerous': max(MUMBAI_ZONES, key=lambda z: z['score'])['name'],
        },
        # Sparkline data for KPIs (monthly trend simulation)
        'sparklines': {
            'incidents': [18, 22, 28, 35, 42, 38, 45, 40, 36, 32, 29, 25],
            'high_risk': [3, 4, 4, 5, 6, 5, 5, 5, 5, 5, 5, 5],
            'avg_score': [48, 50, 52, 55, 58, 56, 55, 54, 53, 52, 51, avg_score],
        },
        # Casualties by zone (horizontal bar)
        'risk_by_zone': {
            'labels': [z['name'] for z in sorted(MUMBAI_ZONES, key=lambda x: -x['score'])[:10]],
            'scores': [z['score'] for z in sorted(MUMBAI_ZONES, key=lambda x: -x['score'])[:10]],
            'risks':  [z['risk'] for z in sorted(MUMBAI_ZONES, key=lambda x: -x['score'])[:10]],
        },
        # Risk distribution donut
        'risk_distribution': {
            'labels': ['High Risk', 'Medium Risk', 'Low Risk'],
            'values': [len(high_zones), len(med_zones), len(low_zones)],
        },
        # Lighting condition donut
        'lighting_distribution': {
            'labels': ['Very Dark (0-0.2)', 'Dim (0.2-0.4)', 'Moderate (0.4-0.6)', 'Well Lit (0.6-0.8)', 'Bright (0.8-1.0)'],
            'values': [
                len([z for z in MUMBAI_ZONES if z.get('lighting', 0.5) < 0.2]),
                len([z for z in MUMBAI_ZONES if 0.2 <= z.get('lighting', 0.5) < 0.4]),
                len([z for z in MUMBAI_ZONES if 0.4 <= z.get('lighting', 0.5) < 0.6]),
                len([z for z in MUMBAI_ZONES if 0.6 <= z.get('lighting', 0.5) < 0.8]),
                len([z for z in MUMBAI_ZONES if z.get('lighting', 0.5) >= 0.8]),
            ],
        },
        # Traffic condition donut
        'traffic_distribution': {
            'labels': ['Very Low', 'Low', 'Moderate', 'High', 'Very High'],
            'values': [
                len([z for z in MUMBAI_ZONES if z.get('traffic', 0.5) < 0.2]),
                len([z for z in MUMBAI_ZONES if 0.2 <= z.get('traffic', 0.5) < 0.4]),
                len([z for z in MUMBAI_ZONES if 0.4 <= z.get('traffic', 0.5) < 0.6]),
                len([z for z in MUMBAI_ZONES if 0.6 <= z.get('traffic', 0.5) < 0.8]),
                len([z for z in MUMBAI_ZONES if z.get('traffic', 0.5) >= 0.8]),
            ],
        },
        # Original chart data
        'accidents_by_lighting': {
            'labels': ['0-0.2', '0.2-0.4', '0.4-0.6', '0.6-0.8', '0.8-1.0'],
            'values': [35, 25, 18, 12, 10],
        },
        'traffic_vs_risk': {
            'labels': ['0-0.2', '0.2-0.4', '0.4-0.6', '0.6-0.8', '0.8-1.0'],
            'high': [40, 28, 15, 10, 7],
            'medium': [20, 25, 30, 15, 10],
            'low': [5, 12, 25, 35, 23],
        },
        'hourly_trend': {
            'labels': ['18h', '19h', '20h', '21h', '22h', '23h', '0h', '1h', '2h', '3h', '4h', '5h'],
            'values': [8, 10, 14, 20, 28, 35, 42, 45, 38, 30, 22, 12],
        },
        'area_distribution': {
            'labels': ['Urban', 'Suburban', 'Rural'],
            'high': [20, 35, 45],
            'medium': [30, 35, 30],
            'low': [50, 30, 25],
        },
    })


# ── Boot ────────────────────────────────────────────────────────────────────

init_db()
load_model()

if __name__ == '__main__':
    app.run(debug=True, port=5000)
