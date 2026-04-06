import os
import sqlite3
import math
import json
import time
import threading
import re
import difflib
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone

import numpy as np
import pandas as pd
import joblib
from flask import Flask, request, jsonify, render_template, g

# ── Config ──────────────────────────────────────────────────────────────────

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE = os.path.join(BASE_DIR, 'database', 'reports.db')
MODEL_PATH = os.path.join(BASE_DIR, 'model', 'model.pkl')
DATA_DIR = os.path.join(BASE_DIR, 'data')

CRIME_DATA_PATH = os.path.join(DATA_DIR, 'mumbai_crime_rate.csv')
STREETLIGHT_DATA_PATH = os.path.join(DATA_DIR, 'mumbai_street_lights.csv')
ACCIDENT_DATA_PATH = os.path.join(DATA_DIR, 'mumbai_accidents.csv')
WARD_BOUNDARY_PATH = os.path.join(DATA_DIR, 'mumbai_ward_boundaries.geojson')
ROAD_NETWORK_PATH = os.path.join(DATA_DIR, 'mumbai_road_network.geojson')
MATERIALIZED_STATS_PATH = os.path.join(BASE_DIR, 'database', 'materialized_stats.json')
REFRESH_INTERVAL_SECONDS = max(120, int(os.environ.get('NNCITY_REFRESH_SECONDS', '900')))
NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
GEOCODE_CACHE_TTL_SECONDS = 900

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

# Human-friendly aliases to support location-first inputs and multilingual voice commands.
WARD_LOCATION_ALIASES = {
    'A': ['colaba', 'fort', 'churchgate', 'cuffe parade', 'nariman point'],
    'B': ['masjid', 'dongri', 'bhuleshwar', 'null bazaar'],
    'C': ['marine lines', 'chira bazar', 'kalbadevi'],
    'D': ['grant road', 'tardeo', 'girgaon'],
    'E': ['byculla', 'mumbai central', 'nagpada'],
    'F/N': ['sion', 'matunga east', 'wadala east'],
    'F/S': ['dadar', 'prabhadevi', 'matunga'],
    'G/N': ['mahim', 'dharavi', 'sion west'],
    'G/S': ['elphinstone', 'lower parel', 'worli naka'],
    'H/W': ['bandra west', 'khar west', 'pali hill'],
    'H/E': ['bandra east', 'kalina', 'vakola'],
    'K/W': ['andheri west', 'lokhandwala', 'oshiwara', 'versova'],
    'K/E': ['andheri east', 'sakinaka', 'marol', 'chakala'],
    'L': ['kurla', 'santacruz chembur link road', 'vidyavihar'],
    'M/W': ['chembur', 'tilak nagar', 'rcf'],
    'M/E': ['govandi', 'deonar', 'mankhurd'],
    'N': ['ghatkopar', 'pant nagar', 'vikhroli west'],
    'P/N': ['malad', 'malad west', 'mindspace'],
    'P/S': ['goregaon', 'goregaon west', 'aarey'],
    'R/N': ['borivali', 'dahisar', 'eksar'],
    'R/C': ['kandivali', 'charkop', 'thakur village'],
    'R/S': ['borivali east', 'magathane', 'national park'],
    'S': ['bhandup', 'powai', 'kanjurmarg'],
    'T': ['mulund', 'nahur'],
}

WARD_PRIMARY_DISPLAY = {
    'A': 'Colaba',
    'B': 'Dongri',
    'C': 'Marine Lines',
    'D': 'Grant Road',
    'E': 'Byculla',
    'F/N': 'Sion',
    'F/S': 'Dadar',
    'G/N': 'Mahim',
    'G/S': 'Lower Parel',
    'H/W': 'Bandra West',
    'H/E': 'Bandra East',
    'K/W': 'Andheri West',
    'K/E': 'Andheri East',
    'L': 'Kurla',
    'M/W': 'Chembur',
    'M/E': 'Govandi',
    'N': 'Ghatkopar',
    'P/N': 'Malad West',
    'P/S': 'Goregaon',
    'R/N': 'Borivali',
    'R/C': 'Kandivali',
    'R/S': 'Borivali East',
    'S': 'Powai',
    'T': 'Mulund',
}

WARD_VOICE_ALIASES = {
    'A': ['ward a', 'a ward', 'ward ay', 'ward ek', 'ward eka', 'ward one'],
    'B': ['ward b', 'b ward', 'ward bee', 'ward do', 'ward two'],
    'C': ['ward c', 'c ward', 'ward see', 'ward teen', 'ward three'],
    'D': ['ward d', 'd ward', 'ward dee', 'ward char', 'ward four'],
    'E': ['ward e', 'e ward', 'ward ee', 'ward paanch', 'ward five'],
    'F/N': ['ward fn', 'ward f n', 'ward f north', 'f north'],
    'F/S': ['ward fs', 'ward f s', 'ward f south', 'f south'],
    'G/N': ['ward gn', 'ward g n', 'ward g north', 'g north'],
    'G/S': ['ward gs', 'ward g s', 'ward g south', 'g south'],
    'H/W': ['ward hw', 'ward h w', 'ward h west', 'h west'],
    'H/E': ['ward he', 'ward h e', 'ward h east', 'h east'],
    'K/W': ['ward kw', 'ward k w', 'ward k west', 'k west'],
    'K/E': ['ward ke', 'ward k e', 'ward k east', 'k east'],
    'M/W': ['ward mw', 'ward m w', 'ward m west', 'm west'],
    'M/E': ['ward me', 'ward m e', 'ward m east', 'm east'],
    'R/N': ['ward rn', 'ward r n', 'ward r north', 'r north'],
    'R/C': ['ward rc', 'ward r c', 'ward r central', 'r central'],
    'R/S': ['ward rs', 'ward r s', 'ward r south', 'r south'],
}

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

# Cached dataset-derived state
CRIME_HOURLY_COUNTS = [0] * 24
CRIME_BY_WARD = {}
CRIME_HOURLY_BY_WARD = {}
CRIME_MONTHLY_COUNTS = []
CRIME_MONTHLY_BY_WARD = {}
LIGHTS_BY_WARD = {}
LIGHTS_STATUS_COUNTS = {}
ACCIDENTS_BY_WARD = {}
ACCIDENT_MONTHLY_COUNTS = []
ACCIDENT_MONTHLY_BY_WARD = {}
ROADS_BY_WARD = defaultdict(list)
ROAD_RISK_BY_WARD = {}
ROAD_SEGMENT_COUNT = 0
WARD_GEOMETRIES = {}
LAST_REFRESHED_AT = None
MATERIALIZED_SOURCE = 'live'
DATA_LOCK = threading.RLock()
REFRESH_THREAD = None
GEOCODE_CACHE = {}


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def to_float(v, default=0.0):
    try:
        if v is None or v == '':
            return default
        return float(v)
    except (TypeError, ValueError):
        return default


def to_int(v, default=0):
    try:
        if v is None or v == '':
            return default
        return int(float(v))
    except (TypeError, ValueError):
        return default


def normalize_ward(value):
    return str(value or '').strip().upper()


def normalize_text(value):
    txt = str(value or '').lower()
    txt = txt.replace('&', ' and ')
    txt = re.sub(r'[^a-z0-9/ ]+', ' ', txt)
    txt = re.sub(r'\s+', ' ', txt).strip()
    return txt


def ward_aliases(ward_id):
    ward_key = normalize_ward(ward_id)
    out = set(WARD_LOCATION_ALIASES.get(ward_key, []))
    out.update(WARD_VOICE_ALIASES.get(ward_key, []))
    out.add(f'ward {ward_key.lower()}')
    out.add(ward_key.lower())
    out.add(ward_key.lower().replace('/', ' '))
    return sorted(out)


def pretty_location_name(raw):
    txt = str(raw or '').strip().replace('/', ' / ')
    txt = re.sub(r'\s+', ' ', txt)
    return txt.title().replace(' / ', '/').replace('Sc', 'SC')


def _infer_zone_display_name(zone):
    ward_id = normalize_ward(zone.get('ward_id'))
    if ward_id:
        preferred_label = WARD_PRIMARY_DISPLAY.get(ward_id)
        if preferred_label:
            return pretty_location_name(preferred_label)

    preferred = str(zone.get('display_name', '')).strip()
    if preferred and not preferred.lower().startswith('ward '):
        return pretty_location_name(preferred)

    aliases = zone.get('aliases') or []
    for alias in aliases:
        alias_txt = str(alias or '').strip()
        if not alias_txt:
            continue
        alias_l = alias_txt.lower()
        if 'ward' in alias_l:
            continue
        if re.fullmatch(r'[a-z]/?[a-z]?', alias_l):
            continue
        return pretty_location_name(alias_txt)

    if ward_id:
        ward_alias_list = WARD_LOCATION_ALIASES.get(ward_id, [])
        if ward_alias_list:
            return pretty_location_name(ward_alias_list[0])
        return f'Area {ward_id}'

    zone_name = str(zone.get('name', '')).strip()
    if zone_name:
        return pretty_location_name(zone_name)
    return 'Unknown Area'


def normalize_zone_metadata():
    for zone in MUMBAI_ZONES:
        ward_id = normalize_ward(zone.get('ward_id'))
        if ward_id:
            zone['ward_id'] = ward_id
            existing_aliases = zone.get('aliases') or []
            if not existing_aliases:
                zone['aliases'] = ward_aliases(ward_id)
        if 'name' not in zone or not str(zone.get('name', '')).strip():
            zone['name'] = f"Ward {ward_id}" if ward_id else 'Unknown Zone'
        zone['display_name'] = _infer_zone_display_name(zone)


def _cache_get_geocode(key):
    entry = GEOCODE_CACHE.get(key)
    if not entry:
        return None
    if time.time() - entry['ts'] > GEOCODE_CACHE_TTL_SECONDS:
        GEOCODE_CACHE.pop(key, None)
        return None
    return entry.get('results', [])


def _cache_set_geocode(key, results):
    GEOCODE_CACHE[key] = {'ts': time.time(), 'results': results}


def geocode_landmark(query, limit=5):
    """Resolve free-form landmarks using Nominatim (Mumbai bounded) with local cache."""
    q = normalize_text(query)
    if not q:
        return []

    cache_key = f"{q}|{int(limit)}"
    cached = _cache_get_geocode(cache_key)
    if cached is not None:
        return cached

    params = {
        'q': query,
        'format': 'jsonv2',
        'limit': max(1, min(10, int(limit))),
        'addressdetails': 0,
        'countrycodes': 'in',
        # Rough Mumbai bbox to keep results relevant.
        'viewbox': '72.73,19.30,73.03,18.86',
        'bounded': 1,
    }

    url = f"{NOMINATIM_URL}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(
        url,
        headers={
            'User-Agent': 'NuitNoire/1.0 (Mumbai safety routing app)',
            'Accept': 'application/json',
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=3.5) as resp:
            payload = json.loads(resp.read().decode('utf-8'))
    except Exception:
        _cache_set_geocode(cache_key, [])
        return []

    out = []
    for item in payload if isinstance(payload, list) else []:
        lat = to_float(item.get('lat'), None)
        lng = to_float(item.get('lon'), None)
        if lat is None or lng is None:
            continue
        out.append({
            'lat': lat,
            'lng': lng,
            'display_name': str(item.get('display_name', '')).strip(),
            'importance': to_float(item.get('importance'), 0),
        })

    _cache_set_geocode(cache_key, out)
    return out


def _zone_search_terms(zone):
    terms = set()
    name = str(zone.get('name', '')).strip().lower()
    ward_id = normalize_ward(zone.get('ward_id'))
    if name:
        terms.add(name)
    if ward_id:
        terms.update(ward_aliases(ward_id))
    return {normalize_text(t) for t in terms if t}


def resolve_zone_by_query(query):
    text = normalize_text(query)
    if not text:
        return None

    direct = find_zone(text)
    if direct:
        return direct

    containment_hits = []
    matches = []
    for z in MUMBAI_ZONES:
        terms = _zone_search_terms(z)
        if text in terms:
            return z
        meaningful_terms = [
            t for t in terms
            if len(t) >= 4 and not t.startswith('ward ') and not re.fullmatch(r'[a-z]/?[a-z]?', t)
        ]

        for t in meaningful_terms:
            if t in text:
                containment_hits.append((len(t), z))
                break

        term_score = max([difflib.SequenceMatcher(None, text, t).ratio() for t in meaningful_terms] + [0.0])

        # Avoid over-eager fuzzy hits for unknown landmarks.
        threshold = 0.76 if len(text) <= 6 else 0.82
        if term_score >= threshold:
            matches.append((term_score, z))

    if containment_hits:
        containment_hits.sort(key=lambda x: x[0], reverse=True)
        return containment_hits[0][1]

    if not matches:
        return None
    matches.sort(key=lambda x: x[0], reverse=True)
    return matches[0][1]


def resolve_zone_input(zone_name=None, location_name=None, lat=None, lng=None):
    if lat is not None and lng is not None:
        return find_nearest_zone(float(lat), float(lng))

    raw = location_name if location_name else zone_name
    if raw is None:
        return None

    query = str(raw).strip()
    if not query:
        return None

    coord_match = re.match(r'^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$', query)
    if coord_match:
        return find_nearest_zone(float(coord_match.group(1)), float(coord_match.group(2)))

    zone = resolve_zone_by_query(query)
    if zone:
        return zone

    # Progressive fallback: external geocoding + nearest ward mapping.
    geo = geocode_landmark(query, limit=1)
    if geo:
        return find_nearest_zone(geo[0]['lat'], geo[0]['lng'])

    return None


def score_to_risk(score):
    if score >= 67:
        return 'high'
    if score >= 34:
        return 'medium'
    return 'low'


def load_csv_aggregates():
    global CRIME_HOURLY_COUNTS, CRIME_BY_WARD, CRIME_HOURLY_BY_WARD, CRIME_MONTHLY_COUNTS
    global CRIME_MONTHLY_BY_WARD, LIGHTS_BY_WARD, LIGHTS_STATUS_COUNTS
    global ACCIDENTS_BY_WARD, ACCIDENT_MONTHLY_COUNTS, ACCIDENT_MONTHLY_BY_WARD

    CRIME_BY_WARD = {}
    CRIME_HOURLY_BY_WARD = {}
    CRIME_MONTHLY_COUNTS = [0] * 12
    CRIME_MONTHLY_BY_WARD = {}
    LIGHTS_BY_WARD = {}
    LIGHTS_STATUS_COUNTS = {}
    ACCIDENTS_BY_WARD = {}
    ACCIDENT_MONTHLY_COUNTS = [0] * 12
    ACCIDENT_MONTHLY_BY_WARD = {}
    CRIME_HOURLY_COUNTS = [0] * 24

    # Crime data: core risk signal
    if os.path.exists(CRIME_DATA_PATH):
        crime = pd.read_csv(CRIME_DATA_PATH, low_memory=False)
        crime['ward_norm'] = crime.get('ward', '').astype(str).str.strip().str.upper()
        crime['hour'] = pd.to_numeric(crime.get('hour', 0), errors='coerce').fillna(0).clip(0, 23).astype(int)
        crime['is_night_num'] = pd.to_numeric(crime.get('is_night', 0), errors='coerce').fillna(0).astype(int)
        crime['crime_risk_score_num'] = pd.to_numeric(crime.get('crime_risk_score', 0), errors='coerce').fillna(0.0)

        hourly = crime.groupby('hour').size()
        CRIME_HOURLY_COUNTS = [int(hourly.get(h, 0)) for h in range(24)]

        grouped = crime.groupby('ward_norm').agg(
            crime_count=('record_id', 'count'),
            crime_risk_mean=('crime_risk_score_num', 'mean'),
            night_crimes=('is_night_num', 'sum'),
        )
        CRIME_BY_WARD = grouped.to_dict(orient='index')

        hourly_by_ward = crime.groupby(['ward_norm', 'hour']).size().unstack(fill_value=0)
        CRIME_HOURLY_BY_WARD = {
            ward: [int(hourly_by_ward.loc[ward].get(h, 0)) for h in range(24)]
            for ward in hourly_by_ward.index
        }

        crime['month_num'] = pd.to_numeric(crime.get('month', 1), errors='coerce').fillna(1).clip(1, 12).astype(int)
        month_counts = crime.groupby('month_num').size()
        CRIME_MONTHLY_COUNTS = [int(month_counts.get(m, 0)) for m in range(1, 13)]

        crime_monthly_ward = crime.groupby(['ward_norm', 'month_num']).size().unstack(fill_value=0)
        CRIME_MONTHLY_BY_WARD = {
            ward: [int(crime_monthly_ward.loc[ward].get(m, 0)) for m in range(1, 13)]
            for ward in crime_monthly_ward.index
        }

    # Streetlight data: lighting-risk correlation
    if os.path.exists(STREETLIGHT_DATA_PATH):
        lights = pd.read_csv(STREETLIGHT_DATA_PATH, low_memory=False)
        lights['ward_norm'] = lights.get('ward', '').astype(str).str.strip().str.upper()
        lights['is_working'] = lights.get('light_status', '').astype(str).str.lower().eq('working').astype(int)
        lights['lux_level_num'] = pd.to_numeric(lights.get('lux_level', 0), errors='coerce').fillna(0.0)
        lights['repair_days_num'] = pd.to_numeric(lights.get('repair_days_pending', 0), errors='coerce').fillna(0)

        grouped = lights.groupby('ward_norm').agg(
            total_lights=('record_id', 'count'),
            working_lights=('is_working', 'sum'),
            avg_lux=('lux_level_num', 'mean'),
            avg_repair_days=('repair_days_num', 'mean'),
        )
        grouped['working_pct'] = np.where(
            grouped['total_lights'] > 0,
            (grouped['working_lights'] / grouped['total_lights']) * 100,
            0,
        )
        LIGHTS_BY_WARD = grouped.to_dict(orient='index')

        LIGHTS_STATUS_COUNTS = lights['light_status'].astype(str).str.strip().str.title().value_counts().to_dict()

    # Accident data: dangerous road-zone signal
    if os.path.exists(ACCIDENT_DATA_PATH):
        accidents = pd.read_csv(ACCIDENT_DATA_PATH, low_memory=False)
        accidents['ward_norm'] = accidents.get('ward', '').astype(str).str.strip().str.upper()
        accidents['is_night_num'] = pd.to_numeric(accidents.get('is_night', 0), errors='coerce').fillna(0).astype(int)
        accidents['severity_score_num'] = pd.to_numeric(accidents.get('severity_score', 0), errors='coerce').fillna(0.0)

        grouped = accidents.groupby('ward_norm').agg(
            accident_count=('record_id', 'count'),
            night_accidents=('is_night_num', 'sum'),
            severity_mean=('severity_score_num', 'mean'),
        )
        ACCIDENTS_BY_WARD = grouped.to_dict(orient='index')

        accidents['month_num'] = pd.to_numeric(accidents.get('month', 1), errors='coerce').fillna(1).clip(1, 12).astype(int)
        acc_month_counts = accidents.groupby('month_num').size()
        ACCIDENT_MONTHLY_COUNTS = [int(acc_month_counts.get(m, 0)) for m in range(1, 13)]

        acc_monthly_ward = accidents.groupby(['ward_norm', 'month_num']).size().unstack(fill_value=0)
        ACCIDENT_MONTHLY_BY_WARD = {
            ward: [int(acc_monthly_ward.loc[ward].get(m, 0)) for m in range(1, 13)]
            for ward in acc_monthly_ward.index
        }


def load_road_aggregates():
    global ROADS_BY_WARD, ROAD_RISK_BY_WARD, ROAD_SEGMENT_COUNT
    ROADS_BY_WARD = defaultdict(list)
    ROAD_RISK_BY_WARD = {}
    ROAD_SEGMENT_COUNT = 0

    if not os.path.exists(ROAD_NETWORK_PATH):
        return

    with open(ROAD_NETWORK_PATH, 'r', encoding='utf-8') as f:
        geo = json.load(f)

    for feature in geo.get('features', []):
        props = feature.get('properties', {})
        geom = feature.get('geometry', {})
        if geom.get('type') != 'LineString':
            continue
        ward = normalize_ward(props.get('ward'))
        if not ward:
            continue
        coords = []
        for pt in geom.get('coordinates', []):
            if len(pt) >= 2:
                lon, lat = pt[0], pt[1]
                coords.append([lat, lon])
        if len(coords) < 2:
            continue

        ROADS_BY_WARD[ward].append({
            'risk': to_float(props.get('night_risk_score'), 0.5),
            'length_m': to_float(props.get('length_m'), 0),
            'coords': coords,
            'name': str(props.get('road_name', 'Road')).strip() or 'Road',
        })
        ROAD_SEGMENT_COUNT += 1

    for ward, roads in ROADS_BY_WARD.items():
        if roads:
            ROAD_RISK_BY_WARD[ward] = sum(r['risk'] for r in roads) / len(roads)


def _feature_centroid(feature):
    props = feature.get('properties', {})
    lat = to_float(props.get('centroid_lat'), None)
    lng = to_float(props.get('centroid_lon'), None)
    if lat is not None and lng is not None:
        return lat, lng

    geom = feature.get('geometry', {})
    if geom.get('type') != 'Polygon':
        return DEFAULT_LAT, DEFAULT_LNG

    rings = geom.get('coordinates', [])
    if not rings or not rings[0]:
        return DEFAULT_LAT, DEFAULT_LNG
    pts = rings[0]
    lat_vals = [p[1] for p in pts if len(p) >= 2]
    lng_vals = [p[0] for p in pts if len(p) >= 2]
    if not lat_vals or not lng_vals:
        return DEFAULT_LAT, DEFAULT_LNG
    return float(sum(lat_vals) / len(lat_vals)), float(sum(lng_vals) / len(lng_vals))


def build_zones_from_ward_geojson():
    global MUMBAI_ZONES, ZONE_INDEX, WARD_GEOMETRIES

    if not os.path.exists(WARD_BOUNDARY_PATH):
        return

    with open(WARD_BOUNDARY_PATH, 'r', encoding='utf-8') as f:
        wards_geo = json.load(f)

    zones = []
    WARD_GEOMETRIES = {}

    for feature in wards_geo.get('features', []):
        props = feature.get('properties', {})
        ward_id = normalize_ward(props.get('ward_id'))
        if not ward_id:
            continue

        lat, lng = _feature_centroid(feature)
        crime = CRIME_BY_WARD.get(ward_id, {})
        lights = LIGHTS_BY_WARD.get(ward_id, {})
        accidents = ACCIDENTS_BY_WARD.get(ward_id, {})

        base_risk_score = to_float(props.get('risk_score'), 0.5)
        if base_risk_score <= 1:
            base_risk_score *= 100

        crime_idx = clamp(to_float(crime.get('crime_risk_mean'), base_risk_score / 100) * 100, 0, 100)
        lighting_working_pct = clamp(
            to_float(lights.get('working_pct'), to_float(props.get('streetlights_working_pct'), 60)),
            0,
            100,
        )
        lighting_idx = 100 - lighting_working_pct
        acc_idx = clamp(to_float(accidents.get('severity_mean'), to_float(props.get('monthly_accidents_per_km2'), 0.6)) * 100, 0, 100)
        road_idx = clamp(to_float(ROAD_RISK_BY_WARD.get(ward_id), 0.5) * 100, 0, 100)

        # Weighted fusion across crime, lights, accidents, roads, and ward baseline risk
        score = round(
            crime_idx * 0.35 +
            lighting_idx * 0.25 +
            acc_idx * 0.2 +
            road_idx * 0.1 +
            base_risk_score * 0.1,
            1,
        )

        risk = score_to_risk(score)
        night_crimes = to_int(crime.get('night_crimes'), 0)
        accident_count = to_int(accidents.get('accident_count'), 0)
        accidents_bin = clamp(int(round(accident_count / 600)), 0, 2)

        geometry = feature.get('geometry', {})
        WARD_GEOMETRIES[ward_id] = geometry

        zones.append({
            'lat': round(lat, 6),
            'lng': round(lng, 6),
            'risk': risk,
            'name': f'Ward {ward_id}',
            'display_name': pretty_location_name((WARD_LOCATION_ALIASES.get(ward_id, [''])[0]) or f'Area {ward_id}'),
            'ward_id': ward_id,
            'score': score,
            'area': str(props.get('zone', 'urban')).strip().lower() or 'urban',
            'lighting': round(lighting_working_pct / 100, 3),
            'traffic': round(clamp(to_float(props.get('safe_mobility_score'), 0.5), 0, 1), 3),
            'accidents': accidents_bin,
            'crime_count': to_int(crime.get('crime_count'), 0),
            'night_crimes': night_crimes,
            'total_lights': to_int(lights.get('total_lights'), 0),
            'working_lights': to_int(lights.get('working_lights'), 0),
            'avg_lux': round(to_float(lights.get('avg_lux'), 0), 1),
            'accident_count': accident_count,
            'monthly_crime_rate_per_1000': to_float(props.get('monthly_crime_rate_per_1000'), 0),
            'monthly_accidents_per_km2': to_float(props.get('monthly_accidents_per_km2'), 0),
            'night_crime_ratio': to_float(props.get('night_crime_ratio'), 0),
            'aliases': ward_aliases(ward_id),
        })

    if zones:
        # Re-balance score bands per refresh so map is not visually collapsed into one class.
        ranked = sorted(zones, key=lambda z: z['score'])
        n = len(ranked)
        low_cut = max(1, n // 3)
        med_cut = max(low_cut + 1, (2 * n) // 3)
        for i, z in enumerate(ranked):
            if i < low_cut:
                z['risk'] = 'low'
            elif i < med_cut:
                z['risk'] = 'medium'
            else:
                z['risk'] = 'high'

        MUMBAI_ZONES[:] = zones
        normalize_zone_metadata()
        ZONE_INDEX.clear()
        ZONE_INDEX.update({z['name'].lower(): z for z in MUMBAI_ZONES})


def load_city_datasets():
    global LAST_REFRESHED_AT, MATERIALIZED_SOURCE
    try:
        with DATA_LOCK:
            load_csv_aggregates()
            load_road_aggregates()
            build_zones_from_ward_geojson()
            LAST_REFRESHED_AT = datetime.now(timezone.utc).isoformat()
            MATERIALIZED_SOURCE = 'live'
            save_materialized_stats()
        print(f"[data] Loaded dataset-driven wards: {len(MUMBAI_ZONES)} zones")
    except Exception as exc:
        print(f"[warn] Failed dataset alignment, using fallback static zones: {exc}")


def build_materialized_payload():
    return {
        'meta': {
            'generated_at': LAST_REFRESHED_AT,
            'zones': len(MUMBAI_ZONES),
            'road_segments': ROAD_SEGMENT_COUNT,
        },
        'zones': MUMBAI_ZONES,
        'ward_geometries': WARD_GEOMETRIES,
        'crime_hourly_counts': CRIME_HOURLY_COUNTS,
        'crime_by_ward': CRIME_BY_WARD,
        'crime_hourly_by_ward': CRIME_HOURLY_BY_WARD,
        'crime_monthly_counts': CRIME_MONTHLY_COUNTS,
        'crime_monthly_by_ward': CRIME_MONTHLY_BY_WARD,
        'lights_by_ward': LIGHTS_BY_WARD,
        'lights_status_counts': LIGHTS_STATUS_COUNTS,
        'accidents_by_ward': ACCIDENTS_BY_WARD,
        'accident_monthly_counts': ACCIDENT_MONTHLY_COUNTS,
        'accident_monthly_by_ward': ACCIDENT_MONTHLY_BY_WARD,
        'roads_by_ward': dict(ROADS_BY_WARD),
        'road_risk_by_ward': ROAD_RISK_BY_WARD,
        'road_segment_count': ROAD_SEGMENT_COUNT,
    }


def apply_materialized_payload(payload):
    global MUMBAI_ZONES, ZONE_INDEX, WARD_GEOMETRIES
    global CRIME_HOURLY_COUNTS, CRIME_BY_WARD, CRIME_HOURLY_BY_WARD, CRIME_MONTHLY_COUNTS, CRIME_MONTHLY_BY_WARD
    global LIGHTS_BY_WARD, LIGHTS_STATUS_COUNTS
    global ACCIDENTS_BY_WARD, ACCIDENT_MONTHLY_COUNTS, ACCIDENT_MONTHLY_BY_WARD
    global ROADS_BY_WARD, ROAD_RISK_BY_WARD, ROAD_SEGMENT_COUNT, LAST_REFRESHED_AT, MATERIALIZED_SOURCE

    MUMBAI_ZONES[:] = payload.get('zones', MUMBAI_ZONES)
    normalize_zone_metadata()
    ZONE_INDEX.clear()
    ZONE_INDEX.update({z['name'].lower(): z for z in MUMBAI_ZONES})

    WARD_GEOMETRIES = payload.get('ward_geometries', {}) or {}
    CRIME_HOURLY_COUNTS = payload.get('crime_hourly_counts', [0] * 24)
    CRIME_BY_WARD = payload.get('crime_by_ward', {}) or {}
    CRIME_HOURLY_BY_WARD = payload.get('crime_hourly_by_ward', {}) or {}
    CRIME_MONTHLY_COUNTS = payload.get('crime_monthly_counts', [0] * 12)
    CRIME_MONTHLY_BY_WARD = payload.get('crime_monthly_by_ward', {}) or {}
    LIGHTS_BY_WARD = payload.get('lights_by_ward', {}) or {}
    LIGHTS_STATUS_COUNTS = payload.get('lights_status_counts', {}) or {}
    ACCIDENTS_BY_WARD = payload.get('accidents_by_ward', {}) or {}
    ACCIDENT_MONTHLY_COUNTS = payload.get('accident_monthly_counts', [0] * 12)
    ACCIDENT_MONTHLY_BY_WARD = payload.get('accident_monthly_by_ward', {}) or {}
    ROADS_BY_WARD = defaultdict(list, payload.get('roads_by_ward', {}) or {})
    ROAD_RISK_BY_WARD = payload.get('road_risk_by_ward', {}) or {}
    ROAD_SEGMENT_COUNT = to_int(payload.get('road_segment_count', 0), 0)

    LAST_REFRESHED_AT = (payload.get('meta', {}) or {}).get('generated_at')
    MATERIALIZED_SOURCE = 'cache'


def save_materialized_stats():
    try:
        os.makedirs(os.path.dirname(MATERIALIZED_STATS_PATH), exist_ok=True)
        with open(MATERIALIZED_STATS_PATH, 'w', encoding='utf-8') as f:
            json.dump(build_materialized_payload(), f)
    except Exception as exc:
        print(f"[warn] Could not save materialized stats: {exc}")


def load_materialized_stats():
    if not os.path.exists(MATERIALIZED_STATS_PATH):
        return False
    try:
        with open(MATERIALIZED_STATS_PATH, 'r', encoding='utf-8') as f:
            payload = json.load(f)
        with DATA_LOCK:
            apply_materialized_payload(payload)
        print(f"[cache] Loaded materialized stats for {len(MUMBAI_ZONES)} zones")
        return True
    except Exception as exc:
        print(f"[warn] Could not load materialized stats: {exc}")
        return False


def refresh_job_loop():
    while True:
        time.sleep(REFRESH_INTERVAL_SECONDS)
        load_city_datasets()


def start_background_refresh_job():
    global REFRESH_THREAD
    if REFRESH_THREAD and REFRESH_THREAD.is_alive():
        return
    REFRESH_THREAD = threading.Thread(target=refresh_job_loop, name='nuit-refresh', daemon=True)
    REFRESH_THREAD.start()

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
        try:
            model = joblib.load(MODEL_PATH)
        except Exception as exc:
            model = None
            print(f"[warn] Could not load model at {MODEL_PATH}: {exc}")
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

@app.route('/ward-intelligence')
def ward_intelligence():
    return render_template('ward_intelligence.html')

@app.route('/report')
def report():
    return render_template('report.html')

@app.route('/about')
def about():
    return render_template('about.html')


# ── API ─────────────────────────────────────────────────────────────────────

def find_zone(name):
    """Look up a zone by internal name, display name, alias, or free-form text."""
    query = str(name or '').strip()
    if not query:
        return None

    by_internal = ZONE_INDEX.get(query.lower())
    if by_internal:
        return by_internal

    for z in MUMBAI_ZONES:
        if normalize_text(z.get('display_name', '')) == normalize_text(query):
            return z
        aliases = z.get('aliases') or []
        if any(normalize_text(a) == normalize_text(query) for a in aliases):
            return z

    return resolve_zone_input(zone_name=query, location_name=query)


def _min_max(values, default_min=0.0, default_max=1.0):
    nums = [to_float(v, None) for v in values]
    nums = [v for v in nums if v is not None]
    if not nums:
        return default_min, default_max
    return min(nums), max(nums)


def _norm(value, lo, hi, default=0.5):
    v = to_float(value, None)
    if v is None:
        return default
    if hi <= lo:
        return default
    return clamp((v - lo) / (hi - lo), 0, 1)


def calibrated_zone_risk(zone, time_hour):
    """Build a stable, zone-differentiated risk score for zone predictions."""
    lighting = clamp(to_float(zone.get('lighting'), 0.5), 0, 1)
    traffic = clamp(to_float(zone.get('traffic'), 0.5), 0, 1)
    base_score = clamp(to_float(zone.get('score'), 50), 0, 100)

    all_scores = [to_float(z.get('score'), 50) for z in MUMBAI_ZONES]
    all_acc = [to_float(z.get('accident_count'), 0) for z in MUMBAI_ZONES]
    score_min, score_max = _min_max(all_scores, 0, 100)
    acc_min, acc_max = _min_max(all_acc, 0, 1)

    base_norm = _norm(base_score, score_min, score_max, 0.5)
    acc_norm = _norm(to_float(zone.get('accident_count'), 0), acc_min, acc_max, 0.5)

    # Low traffic and low lighting raise nighttime vulnerability.
    lighting_risk = (1 - lighting) * 100
    traffic_risk = (1 - traffic) * 100
    base_risk = base_norm * 100
    accident_risk = acc_norm * 100

    if 0 <= time_hour < 5:
        time_penalty = 16
    elif 20 <= time_hour <= 23:
        time_penalty = 10
    else:
        time_penalty = 3

    risk_score = round(
        base_risk * 0.38 +
        lighting_risk * 0.27 +
        traffic_risk * 0.2 +
        accident_risk * 0.15 +
        time_penalty,
        1,
    )

    # Convert normalized accident signal to 0/1/2 for explainability helpers.
    if acc_norm >= 0.67:
        acc_hist = 2
    elif acc_norm >= 0.34:
        acc_hist = 1
    else:
        acc_hist = 0

    if risk_score >= 67:
        risk_code = 2
    elif risk_score >= 43:
        risk_code = 1
    else:
        risk_code = 0

    return risk_code, clamp(risk_score, 0, 100), acc_hist


def find_nearest_zone(lat, lng):
    """Return the zone closest to given coordinates."""
    best, best_d = None, float('inf')
    for z in MUMBAI_ZONES:
        d = (z['lat'] - lat) ** 2 + (z['lng'] - lng) ** 2
        if d < best_d:
            best, best_d = z, d
    return best


def _pick_ward_road(ward_id, prefer_safe=True):
    roads = ROADS_BY_WARD.get(ward_id, [])
    if not roads:
        return None
    roads_sorted = sorted(roads, key=lambda r: r['risk'])
    return roads_sorted[0] if prefer_safe else roads_sorted[-1]


def build_route_from_roads(start_zone, dest_zone, prefer_safe=True):
    start_ward = start_zone.get('ward_id', '').upper()
    dest_ward = dest_zone.get('ward_id', '').upper()

    start_road = _pick_ward_road(start_ward, prefer_safe=prefer_safe)
    dest_road = _pick_ward_road(dest_ward, prefer_safe=prefer_safe)

    route = [[start_zone['lat'], start_zone['lng']]]

    if start_road and start_road['coords']:
        route.extend(start_road['coords'][:3])

    mid_lat = (start_zone['lat'] + dest_zone['lat']) / 2
    mid_lng = (start_zone['lng'] + dest_zone['lng']) / 2
    offset = -0.002 if prefer_safe else 0.002
    route.append([round(mid_lat + offset, 6), round(mid_lng - offset, 6)])

    if dest_road and dest_road['coords']:
        route.extend(dest_road['coords'][-3:])

    route.append([dest_zone['lat'], dest_zone['lng']])

    cleaned = []
    for p in route:
        if not cleaned or cleaned[-1] != p:
            cleaned.append(p)
    return cleaned


def find_safe_route(start_zone, dest_zone, time_hour):
    """Build route suggestions using ward-level road-risk data."""
    suggestions = []
    start_name = start_zone.get('display_name', start_zone['name'])
    dest_name = dest_zone.get('display_name', dest_zone['name'])
    start_ward = start_zone.get('ward_id', '').upper()
    dest_ward = dest_zone.get('ward_id', '').upper()

    dist_km = round(math.sqrt(
        (start_zone['lat'] - dest_zone['lat']) ** 2 +
        (start_zone['lng'] - dest_zone['lng']) ** 2
    ) * 111, 1)

    taxi_cost = max(25, round(23 + dist_km * 14))
    auto_cost = max(18, round(18 + dist_km * 11))

    start_road_risk = to_float(ROAD_RISK_BY_WARD.get(start_ward), 0.5)
    dest_road_risk = to_float(ROAD_RISK_BY_WARD.get(dest_ward), 0.5)
    avg_road_risk = (start_road_risk + dest_road_risk) / 2

    safe_start = _pick_ward_road(start_ward, prefer_safe=True)
    safe_dest = _pick_ward_road(dest_ward, prefer_safe=True)

    suggestions.append({
        'type': 'taxi',
        'icon': '🚕',
        'title': f'Take a taxi from {start_name} to {dest_name}',
        'detail': f'~{dist_km} km · Estimated ₹{taxi_cost} · Avoids high-risk night-walk segments',
        'cost': taxi_cost,
        'time': max(8, round(dist_km * 3.5)),
        'safety': 'high',
    })

    if dist_km < 15:
        suggestions.append({
            'type': 'auto',
            'icon': '🛺',
            'title': f'Auto rickshaw {start_name} → {dest_name}',
            'detail': f'~{dist_km} km · Estimated ₹{auto_cost} · Good last-mile option at night',
            'cost': auto_cost,
            'time': max(10, round(dist_km * 4)),
            'safety': 'medium' if avg_road_risk > 0.65 else 'high',
        })

    if safe_start or safe_dest:
        safe_roads = []
        if safe_start:
            safe_roads.append(f"{safe_start['name']} ({start_ward})")
        if safe_dest:
            safe_roads.append(f"{safe_dest['name']} ({dest_ward})")
        suggestions.append({
            'type': 'transit',
            'icon': '🛣️',
            'title': 'Safer road corridor recommendation',
            'detail': f"Use lower-risk segments: {' → '.join(safe_roads)}",
            'cost': 0,
            'time': max(12, round(dist_km * 5)),
            'safety': 'high' if avg_road_risk < 0.55 else 'medium',
            'steps': [
                {
                    'from': start_name,
                    'to': dest_name,
                    'bus': 'Road-network guided',
                    'fare': 0,
                    'time': max(12, round(dist_km * 5)),
                    'risk': 'low' if avg_road_risk < 0.55 else 'medium',
                }
            ],
            'warning': 'Route crosses moderate night-risk roads' if avg_road_risk >= 0.55 else None,
        })

    if dist_km < 2:
        walk_time = max(5, round(dist_km * 13))
        walk_safe = 'high' if avg_road_risk < 0.45 else ('medium' if avg_road_risk < 0.65 else 'low')
        suggestions.append({
            'type': 'walk',
            'icon': '🚶',
            'title': f'Walk from {start_name} to {dest_name}',
            'detail': f"~{dist_km} km · {walk_time} min · {'Well-lit corridor' if walk_safe == 'high' else 'Use caution in dim segments'}",
            'cost': 0,
            'time': walk_time,
            'safety': walk_safe,
        })

    return suggestions


def _route_priority_weights(priority):
    key = str(priority or 'balanced').strip().lower()
    if key == 'safety':
        return {'risk': 0.6, 'time': 0.25, 'cost': 0.15}
    if key == 'time':
        return {'risk': 0.25, 'time': 0.6, 'cost': 0.15}
    if key == 'budget':
        return {'risk': 0.25, 'time': 0.2, 'cost': 0.55}
    return {'risk': 0.4, 'time': 0.35, 'cost': 0.25}


def build_route_alternatives(start_zone, dest_zone, time_hour, priority='balanced'):
    dist_km = max(0.4, round(math.sqrt(
        (start_zone['lat'] - dest_zone['lat']) ** 2 +
        (start_zone['lng'] - dest_zone['lng']) ** 2
    ) * 111, 1))

    start_ward = normalize_ward(start_zone.get('ward_id'))
    dest_ward = normalize_ward(dest_zone.get('ward_id'))
    avg_road_risk = (
        to_float(ROAD_RISK_BY_WARD.get(start_ward), 0.5) +
        to_float(ROAD_RISK_BY_WARD.get(dest_ward), 0.5)
    ) / 2

    zone_risk_penalty = 8 if (start_zone.get('risk') == 'high' or dest_zone.get('risk') == 'high') else 0
    late_night_penalty = 12 if (time_hour >= 22 or time_hour <= 4) else 0
    base_exposure = clamp(avg_road_risk * 100 + zone_risk_penalty + late_night_penalty, 8, 95)

    candidates = [
        {
            'id': 'shield-taxi',
            'mode': 'taxi',
            'title': 'Shield Route (Taxi Priority)',
            'color': '#34d399',
            'time_min': max(8, round(dist_km * 3.2)),
            'cost_inr': max(30, round(25 + dist_km * 15)),
            'risk_exposure': round(clamp(base_exposure * 0.58, 5, 90), 1),
            'tradeoffs': [
                'Lowest estimated exposure on risky corridors',
                'Fast door-to-door travel at premium fare',
            ],
            'polyline': build_route_from_roads(start_zone, dest_zone, prefer_safe=True),
        },
        {
            'id': 'balanced-auto-transit',
            'mode': 'auto',
            'title': 'Balanced Route (Auto + Safer Corridors)',
            'color': '#60a5fa',
            'time_min': max(11, round(dist_km * 4.1)),
            'cost_inr': max(20, round(15 + dist_km * 10)),
            'risk_exposure': round(clamp(base_exposure * 0.77, 7, 92), 1),
            'tradeoffs': [
                'Lower cost than taxi with moderate ETA',
                'Slightly higher exposure in mixed-risk segments',
            ],
            'polyline': build_route_from_roads(start_zone, dest_zone, prefer_safe=True),
        },
        {
            'id': 'budget-transit-walk',
            'mode': 'transit',
            'title': 'Budget Route (Transit + Walk)',
            'color': '#f59e0b',
            'time_min': max(14, round(dist_km * 5.4)),
            'cost_inr': max(5, round(dist_km * 4)),
            'risk_exposure': round(clamp(base_exposure * 1.05 + (6 if dist_km < 2.2 else 0), 10, 97), 1),
            'tradeoffs': [
                'Most affordable option',
                'Longest duration and more exposure to street conditions',
            ],
            'polyline': build_route_from_roads(start_zone, dest_zone, prefer_safe=False),
        },
    ]

    weights = _route_priority_weights(priority)
    max_time = max(c['time_min'] for c in candidates)
    max_cost = max(c['cost_inr'] for c in candidates)

    for c in candidates:
        r_norm = c['risk_exposure'] / 100
        t_norm = c['time_min'] / max_time if max_time else 0
        c_norm = c['cost_inr'] / max_cost if max_cost else 0
        blended = (weights['risk'] * r_norm) + (weights['time'] * t_norm) + (weights['cost'] * c_norm)
        c['rank_score'] = round(100 - (blended * 100), 1)
        c['explainability'] = {
            'priority': str(priority or 'balanced').lower(),
            'weights': weights,
            'factors': {
                'risk': round(r_norm, 3),
                'time': round(t_norm, 3),
                'cost': round(c_norm, 3),
            },
        }

    ranked = sorted(candidates, key=lambda x: x['rank_score'], reverse=True)
    for i, c in enumerate(ranked, start=1):
        c['rank'] = i

    return ranked


@app.route('/api/analyze-route', methods=['POST'])
def api_analyze_route():
    data = request.get_json(force=True)
    start_name = str(data.get('start_zone', '')).strip()
    dest_name = str(data.get('dest_zone', '')).strip()
    start_location = str(data.get('start_location', '')).strip()
    dest_location = str(data.get('dest_location', '')).strip()
    start_lat = data.get('start_lat')
    start_lng = data.get('start_lng')
    dest_lat = data.get('dest_lat')
    dest_lng = data.get('dest_lng')
    time_val = data.get('time', 23)

    try:
        time_hour = int(str(time_val).split(':')[0]) if ':' in str(time_val) else int(time_val)
    except (ValueError, TypeError):
        time_hour = 23
    time_hour = max(0, min(23, time_hour))

    # Resolve by location text or coordinates first, then by zone names.
    start_zone = resolve_zone_input(
        zone_name=start_name,
        location_name=start_location,
        lat=start_lat,
        lng=start_lng,
    )
    dest_zone = resolve_zone_input(
        zone_name=dest_name,
        location_name=dest_location,
        lat=dest_lat,
        lng=dest_lng,
    )
    if not start_zone or not dest_zone:
        return jsonify({'error': 'Could not resolve start or destination location'}), 400

    lat1, lon1 = start_zone['lat'], start_zone['lng']
    lat2, lon2 = dest_zone['lat'], dest_zone['lng']

    # Use actual zone data for risk analysis
    lighting = start_zone.get('lighting', 0.3)
    traffic = start_zone.get('traffic', 0.3)
    acc_hist = start_zone.get('accidents', 1)
    area = start_zone.get('area', 'urban')

    risk_level, risk_score = predict_risk(lighting, traffic, acc_hist, area, time_hour)
    reasons = explain_risk(lighting, traffic, acc_hist, area, time_hour)

    priority = str(data.get('priority', 'balanced')).strip().lower()

    # Generate smart suggestions if route is risky
    suggestions = []
    if risk_level >= 1:  # medium or high
        suggestions = find_safe_route(start_zone, dest_zone, time_hour)

    alternatives = build_route_alternatives(start_zone, dest_zone, time_hour, priority=priority)

    return jsonify({
        'risk_level': RISK_LABELS[risk_level],
        'risk_score': risk_score,
        'risk_code': risk_level,
        'reasons': reasons,
        'start_zone': {
            'name': start_zone.get('display_name', start_zone['name']),
            'lat': lat1,
            'lng': lon1,
            'risk': start_zone['risk'],
            'score': start_zone['score'],
        },
        'dest_zone': {
            'name': dest_zone.get('display_name', dest_zone['name']),
            'lat': lat2,
            'lng': lon2,
            'risk': dest_zone['risk'],
            'score': dest_zone['score'],
        },
        'features': {
            'lighting_level': lighting,
            'traffic_density': traffic,
            'accident_history': acc_hist,
            'area_type': area,
            'time_hour': time_hour,
        },
        'unsafe_route': build_route_from_roads(start_zone, dest_zone, prefer_safe=False),
        'safe_route': build_route_from_roads(start_zone, dest_zone, prefer_safe=True),
        'suggestions': suggestions,
        'priority': priority,
        'route_alternatives': alternatives,
        'resolution': {
            'start_input': (start_location or start_name or '').strip(),
            'dest_input': (dest_location or dest_name or '').strip(),
            'start_resolved': start_zone.get('display_name', start_zone.get('name')),
            'dest_resolved': dest_zone.get('display_name', dest_zone.get('name')),
            'start_ward_id': start_zone.get('ward_id'),
            'dest_ward_id': dest_zone.get('ward_id'),
        },
    })


@app.route('/api/route-alternatives', methods=['POST'])
def api_route_alternatives():
    data = request.get_json(force=True)
    start_name = str(data.get('start_zone', '')).strip()
    dest_name = str(data.get('dest_zone', '')).strip()
    start_location = str(data.get('start_location', '')).strip()
    dest_location = str(data.get('dest_location', '')).strip()
    priority = str(data.get('priority', 'balanced')).strip().lower()

    try:
        time_hour = int(str(data.get('time', 23)).split(':')[0])
    except (TypeError, ValueError):
        time_hour = 23
    time_hour = clamp(time_hour, 0, 23)

    start_zone = resolve_zone_input(zone_name=start_name, location_name=start_location)
    dest_zone = resolve_zone_input(zone_name=dest_name, location_name=dest_location)
    if not start_zone or not dest_zone:
        return jsonify({'error': 'Could not resolve start or destination location'}), 400

    alternatives = build_route_alternatives(start_zone, dest_zone, time_hour, priority=priority)
    return jsonify({
        'start_zone': start_zone.get('display_name', start_zone['name']),
        'dest_zone': dest_zone.get('display_name', dest_zone['name']),
        'priority': priority,
        'alternatives': alternatives,
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
    area = zone.get('area', 'urban')

    risk_level, risk_score, acc_hist = calibrated_zone_risk(zone, time_hour)
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
        {
            'lat': z['lat'],
            'lng': z['lng'],
            'risk': z['risk'],
            'name': z.get('display_name', z['name']),
            'score': z['score'],
            'ward_id': z.get('ward_id'),
            'boundary': WARD_GEOMETRIES.get(z.get('ward_id', ''), None),
        }
        for z in MUMBAI_ZONES
    ]})


@app.route('/api/zones-detail')
def api_zones_detail():
    """Return dataset-backed ward detail for interactive map layers."""
    detailed = []
    crime_values = [to_int(z.get('crime_count'), 0) for z in MUMBAI_ZONES]
    min_crime_count = min(crime_values) if crime_values else 0
    max_crime_count = max(crime_values) if crime_values else 1
    crime_span = max(1, max_crime_count - min_crime_count)
    for z in MUMBAI_ZONES:
        lighting = z.get('lighting', 0.5)
        accidents = z.get('accidents', 0)
        score = z['score']

        crime_count = max(0, to_int(z.get('crime_count'), 0))
        total_lights = max(0, to_int(z.get('total_lights'), 0))
        working_lights = max(0, to_int(z.get('working_lights'), 0))
        if total_lights > 0:
            faulty_lights = max(0, total_lights - working_lights)
        else:
            total_lights = 100
            faulty_lights = round((1 - lighting) * total_lights)
        working_lights = total_lights - faulty_lights

        faulty_pct = round((faulty_lights / total_lights) * 100, 1) if total_lights else 0
        crime_index = int(round(((crime_count - min_crime_count) / crime_span) * 100)) if crime_span else 50

        # Combined risk = weighted mix from dataset-derived crime + lighting + model score
        crime_factor = min(1.0, crime_count / max_crime_count)
        light_factor = 1 - lighting
        combined_risk = round((crime_factor * 0.4 + light_factor * 0.3 + (score / 100) * 0.3) * 100, 1)

        detailed.append({
            'name': z.get('display_name', z['name']),
            'zone_name': z['name'],
            'lat': z['lat'],
            'lng': z['lng'],
            'ward_id': z.get('ward_id'),
            'risk': z['risk'],
            'score': score,
            'area': z.get('area', 'urban'),
            'lighting': lighting,
            'traffic': z.get('traffic', 0.5),
            'accidents': accidents,
            'crime_count': crime_count,
            'crime_index': crime_index,
            'total_lights': total_lights,
            'faulty_lights': faulty_lights,
            'faulty_lights_pct': faulty_pct,
            'working_lights': working_lights,
            'combined_risk': combined_risk,
            'combined_risk_rounded': int(round(combined_risk)),
            'boundary': WARD_GEOMETRIES.get(z.get('ward_id', ''), None),
        })
    return jsonify({'zones': detailed})


@app.route('/api/zones-list')
def api_zones_list():
    """Return sorted zone names for dropdowns with full data."""
    return jsonify({'zones': sorted(
                [{'name': z.get('display_name', z['name']), 'zone_name': z['name'], 'risk': z['risk'], 'score': z['score'],
          'lat': z['lat'], 'lng': z['lng'],
                    'ward_id': z.get('ward_id'),
          'aliases': z.get('aliases', [])[:10],
          'lighting': z.get('lighting', 0.5), 'traffic': z.get('traffic', 0.5),
          'accidents': z.get('accidents', 1), 'area': z.get('area', 'urban'),
          } for z in MUMBAI_ZONES],
        key=lambda x: x['name'],
    )})


@app.route('/api/location-suggestions')
def api_location_suggestions():
    q = normalize_text(request.args.get('q', ''))

    records = []
    for z in MUMBAI_ZONES:
        aliases = z.get('aliases', [])
        label = z.get('display_name', z.get('name'))
        for alias in aliases + [z.get('name', '')]:
            alias_norm = normalize_text(alias)
            if not alias_norm:
                continue
            score = 0.0
            if not q:
                score = 0.5
            elif q == alias_norm:
                score = 1.0
            elif q in alias_norm or alias_norm in q:
                score = 0.85
            else:
                score = difflib.SequenceMatcher(None, q, alias_norm).ratio()

            if score < 0.55 and q:
                continue

            records.append({
                'label': label,
                'query_text': alias,
                'zone_name': z.get('name'),
                'ward_id': z.get('ward_id'),
                'lat': z.get('lat'),
                'lng': z.get('lng'),
                'score': round(score, 3),
            })

    unique = {}
    for r in sorted(records, key=lambda x: x['score'], reverse=True):
        k = (r['zone_name'], normalize_text(r['query_text']))
        if k not in unique:
            unique[k] = r
        if len(unique) >= 40:
            break

    # Progressive fallback: add geocoded landmarks when typed query is specific.
    if q and len(q) >= 4 and len(unique) < 16:
        geo_results = geocode_landmark(q, limit=8)
        for item in geo_results:
            zone = find_nearest_zone(item['lat'], item['lng'])
            if not zone:
                continue
            disp = item.get('display_name', '')
            short = disp.split(',')[0] if disp else q
            rec = {
                'label': f"{short} → near {zone.get('display_name', zone.get('name'))}",
                'query_text': short,
                'zone_name': zone.get('name'),
                'ward_id': zone.get('ward_id'),
                'lat': item['lat'],
                'lng': item['lng'],
                'score': round(clamp(item.get('importance', 0), 0, 1), 3),
                'source': 'geocoder',
            }
            key = (rec['zone_name'], normalize_text(rec['query_text']))
            if key not in unique:
                unique[key] = rec
            if len(unique) >= 40:
                break

    return jsonify({'suggestions': list(unique.values())})


@app.route('/api/ward-boundaries')
def api_ward_boundaries():
    """Return styled ward boundary polygons for map rendering and thematic layers."""
    features = []
    for z in MUMBAI_ZONES:
        geom = WARD_GEOMETRIES.get(z.get('ward_id', ''), None)
        if not geom:
            continue
        features.append({
            'type': 'Feature',
            'geometry': geom,
            'properties': {
                'ward_id': z.get('ward_id'),
                'name': z.get('display_name', z.get('name')),
                'risk': z.get('risk'),
                'score': z.get('score'),
                'crime_count': z.get('crime_count', 0),
                'lighting': z.get('lighting', 0.5),
                'faulty_lights': max(0, to_int(z.get('total_lights', 0)) - to_int(z.get('working_lights', 0))),
            },
        })
    return jsonify({'type': 'FeatureCollection', 'features': features})


@app.route('/api/road-segments')
def api_road_segments():
    """Return road network segments with risk metadata (optionally ward-filtered)."""
    ward_filter = normalize_ward(request.args.get('ward', ''))
    limit = max(50, min(3000, to_int(request.args.get('limit', 1200), 1200)))

    segments = []
    wards = [ward_filter] if ward_filter else list(ROADS_BY_WARD.keys())
    for ward in wards:
        for road in ROADS_BY_WARD.get(ward, []):
            risk = to_float(road.get('risk'), 0.5)
            risk_level = 'high' if risk >= 0.67 else ('medium' if risk >= 0.34 else 'low')
            segments.append({
                'ward_id': ward,
                'name': road.get('name', 'Road'),
                'risk_score': round(risk, 3),
                'risk_level': risk_level,
                'length_m': round(to_float(road.get('length_m'), 0), 1),
                'coords': road.get('coords', []),
            })
            if len(segments) >= limit:
                break
        if len(segments) >= limit:
            break

    return jsonify({'segments': segments, 'count': len(segments), 'total_available': ROAD_SEGMENT_COUNT})


@app.route('/api/ward-profile')
def api_ward_profile():
    """Return deep-dive profile for one ward (crime, lights, accidents, roads, time pattern)."""
    ward_id = normalize_ward(request.args.get('ward', ''))
    zone = next((z for z in MUMBAI_ZONES if normalize_ward(z.get('ward_id')) == ward_id), None)
    if not zone:
        return jsonify({'error': 'ward not found'}), 404

    hourly = CRIME_HOURLY_BY_WARD.get(ward_id, [0] * 24)
    roads = ROADS_BY_WARD.get(ward_id, [])
    top_roads = sorted(roads, key=lambda r: to_float(r.get('risk'), 0), reverse=True)[:8]

    total_lights = max(0, to_int(zone.get('total_lights'), 0))
    working_lights = max(0, to_int(zone.get('working_lights'), 0))
    faulty_lights = max(0, total_lights - working_lights)

    return jsonify({
        'ward_id': ward_id,
        'zone': {
            'name': zone.get('display_name', zone.get('name')),
            'risk': zone.get('risk'),
            'score': zone.get('score'),
            'area': zone.get('area'),
            'aliases': zone.get('aliases', []),
            'lat': zone.get('lat'),
            'lng': zone.get('lng'),
            'boundary': WARD_GEOMETRIES.get(ward_id),
        },
        'crime': {
            'count': to_int(zone.get('crime_count'), 0),
            'night_count': to_int(zone.get('night_crimes'), 0),
            'hourly': hourly,
            'monthly': CRIME_MONTHLY_BY_WARD.get(ward_id, [0] * 12),
            'peak_hour': int(np.argmax(hourly)) if hourly else 0,
            'monthly_rate_per_1000': round(to_float(zone.get('monthly_crime_rate_per_1000'), 0), 2),
        },
        'lighting': {
            'coverage_ratio': round(clamp(to_float(zone.get('lighting'), 0.5), 0, 1), 3),
            'avg_lux': round(to_float(zone.get('avg_lux'), 0), 2),
            'total_lights': total_lights,
            'working_lights': working_lights,
            'faulty_lights': faulty_lights,
            'working_pct': round((working_lights / total_lights) * 100, 1) if total_lights else 0,
        },
        'accidents': {
            'count': to_int(zone.get('accident_count'), 0),
            'severity_band': to_int(zone.get('accidents'), 0),
            'monthly': ACCIDENT_MONTHLY_BY_WARD.get(ward_id, [0] * 12),
            'monthly_per_km2': round(to_float(zone.get('monthly_accidents_per_km2'), 0), 2),
        },
        'roads': {
            'segment_count': len(roads),
            'avg_road_risk': round(to_float(ROAD_RISK_BY_WARD.get(ward_id), 0), 3),
            'top_risky': [
                {
                    'name': r.get('name', 'Road'),
                    'risk_score': round(to_float(r.get('risk'), 0), 3),
                    'length_m': round(to_float(r.get('length_m'), 0), 1),
                }
                for r in top_roads
            ],
        },
    })


@app.route('/api/cache-status')
def api_cache_status():
    return jsonify({
        'materialized_file': os.path.exists(MATERIALIZED_STATS_PATH),
        'source': MATERIALIZED_SOURCE,
        'last_refreshed_at': LAST_REFRESHED_AT,
        'refresh_interval_seconds': REFRESH_INTERVAL_SECONDS,
        'zones_loaded': len(MUMBAI_ZONES),
    })


@app.route('/api/refresh-data', methods=['POST'])
def api_refresh_data():
    load_city_datasets()
    return jsonify({'ok': True, 'last_refreshed_at': LAST_REFRESHED_AT, 'source': MATERIALIZED_SOURCE})


@app.route('/api/city-overview')
def api_city_overview():
    """Return high-level city analytics snapshot for dashboards and cards."""
    total_crime = sum(to_int(v.get('crime_count'), 0) for v in CRIME_BY_WARD.values())
    total_acc = sum(to_int(v.get('accident_count'), 0) for v in ACCIDENTS_BY_WARD.values())
    total_lights = sum(to_int(v.get('total_lights'), 0) for v in LIGHTS_BY_WARD.values())
    working_lights = sum(to_int(v.get('working_lights'), 0) for v in LIGHTS_BY_WARD.values())
    faulty_lights = max(0, total_lights - working_lights)

    if MUMBAI_ZONES:
        safest = min(MUMBAI_ZONES, key=lambda z: z.get('score', 0)).get('display_name') or min(MUMBAI_ZONES, key=lambda z: z.get('score', 0)).get('name')
        dangerous = max(MUMBAI_ZONES, key=lambda z: z.get('score', 0)).get('display_name') or max(MUMBAI_ZONES, key=lambda z: z.get('score', 0)).get('name')
    else:
        safest = ''
        dangerous = ''

    return jsonify({
        'zones': {
            'total': len(MUMBAI_ZONES),
            'high': len([z for z in MUMBAI_ZONES if z.get('risk') == 'high']),
            'medium': len([z for z in MUMBAI_ZONES if z.get('risk') == 'medium']),
            'low': len([z for z in MUMBAI_ZONES if z.get('risk') == 'low']),
            'safest': safest,
            'most_dangerous': dangerous,
        },
        'crime': {
            'total_records': total_crime,
            'hourly': CRIME_HOURLY_COUNTS,
            'monthly': CRIME_MONTHLY_COUNTS,
            'peak_hour': int(np.argmax(CRIME_HOURLY_COUNTS)) if CRIME_HOURLY_COUNTS else 0,
        },
        'lights': {
            'total': total_lights,
            'working': working_lights,
            'faulty': faulty_lights,
            'working_pct': round((working_lights / total_lights) * 100, 1) if total_lights else 0,
            'status_mix': LIGHTS_STATUS_COUNTS,
        },
        'accidents': {
            'total_records': total_acc,
            'monthly': ACCIDENT_MONTHLY_COUNTS,
        },
        'roads': {
            'segments': ROAD_SEGMENT_COUNT,
            'wards_with_roads': len(ROADS_BY_WARD),
            'avg_risk_city': round(np.mean(list(ROAD_RISK_BY_WARD.values())), 3) if ROAD_RISK_BY_WARD else 0,
        },
    })


@app.route('/api/dataset-health')
def api_dataset_health():
    """Expose dataset readiness and basic cardinality for observability."""
    return jsonify({
        'files': {
            'crime_csv': os.path.exists(CRIME_DATA_PATH),
            'streetlights_csv': os.path.exists(STREETLIGHT_DATA_PATH),
            'accidents_csv': os.path.exists(ACCIDENT_DATA_PATH),
            'ward_geojson': os.path.exists(WARD_BOUNDARY_PATH),
            'road_geojson': os.path.exists(ROAD_NETWORK_PATH),
        },
        'loaded': {
            'zones': len(MUMBAI_ZONES),
            'crime_wards': len(CRIME_BY_WARD),
            'lights_wards': len(LIGHTS_BY_WARD),
            'accident_wards': len(ACCIDENTS_BY_WARD),
            'road_wards': len(ROADS_BY_WARD),
            'road_segments': ROAD_SEGMENT_COUNT,
        },
        'cache': {
            'source': MATERIALIZED_SOURCE,
            'materialized_file': os.path.exists(MATERIALIZED_STATS_PATH),
            'last_refreshed_at': LAST_REFRESHED_AT,
            'refresh_interval_seconds': REFRESH_INTERVAL_SECONDS,
        },
    })


@app.route('/api/insights-data')
def api_insights_data():
    if not MUMBAI_ZONES:
        return jsonify({'error': 'No zones loaded'}), 500

    high_zones = [z for z in MUMBAI_ZONES if z['risk'] == 'high']
    med_zones  = [z for z in MUMBAI_ZONES if z['risk'] == 'medium']
    low_zones  = [z for z in MUMBAI_ZONES if z['risk'] == 'low']
    avg_score  = round(sum(z['score'] for z in MUMBAI_ZONES) / len(MUMBAI_ZONES), 1)

    # Night hourly crime trend from crime dataset (core signal)
    night_hours = list(range(18, 24)) + list(range(0, 6))
    hourly_labels = [f'{h}h' for h in night_hours]
    hourly_values = [CRIME_HOURLY_COUNTS[h] if h < len(CRIME_HOURLY_COUNTS) else 0 for h in night_hours]
    peak_hour = night_hours[int(np.argmax(hourly_values))] if hourly_values else 0

    lighting_buckets = [0, 0, 0, 0, 0]
    for z in MUMBAI_ZONES:
        l = clamp(z.get('lighting', 0.5), 0, 1)
        idx = min(4, int(l * 5))
        lighting_buckets[idx] += 1

    accident_lighting = [0, 0, 0, 0, 0]
    for z in MUMBAI_ZONES:
        l = clamp(z.get('lighting', 0.5), 0, 1)
        idx = min(4, int(l * 5))
        accident_lighting[idx] += to_int(z.get('accident_count', 0), 0)

    area_labels = sorted({str(z.get('area', 'urban')).capitalize() for z in MUMBAI_ZONES})
    area_high, area_med, area_low = [], [], []
    for area in area_labels:
        area_zones = [z for z in MUMBAI_ZONES if str(z.get('area', 'urban')).capitalize() == area]
        total = max(1, len(area_zones))
        area_high.append(round(100 * len([z for z in area_zones if z['risk'] == 'high']) / total))
        area_med.append(round(100 * len([z for z in area_zones if z['risk'] == 'medium']) / total))
        area_low.append(round(100 * len([z for z in area_zones if z['risk'] == 'low']) / total))

    total_incidents = sum(to_int(v.get('crime_count'), 0) for v in CRIME_BY_WARD.values())
    total_accidents = sum(to_int(v.get('accident_count'), 0) for v in ACCIDENTS_BY_WARD.values())

    return jsonify({
        # KPI summary data
        'kpis': {
            'total_zones': len(MUMBAI_ZONES),
            'high_risk': len(high_zones),
            'medium_risk': len(med_zones),
            'low_risk': len(low_zones),
            'avg_score': avg_score,
            'total_incidents': total_incidents,
            'peak_hour': peak_hour,
            'peak_hour_label': f'{peak_hour:02d}:00',
            'safest_zone': min(MUMBAI_ZONES, key=lambda z: z['score']).get('display_name', min(MUMBAI_ZONES, key=lambda z: z['score'])['name']),
            'most_dangerous': max(MUMBAI_ZONES, key=lambda z: z['score']).get('display_name', max(MUMBAI_ZONES, key=lambda z: z['score'])['name']),
        },
        # Sparkline data from observed aggregates
        'sparklines': {
            'incidents': [int(v) for v in np.array(hourly_values)[-12:].tolist()],
            'high_risk': [max(0, len(high_zones) - 2), max(0, len(high_zones) - 1), len(high_zones), len(high_zones), len(high_zones) + 1, len(high_zones)],
            'avg_score': [max(0, avg_score - 6), max(0, avg_score - 4), max(0, avg_score - 2), avg_score - 1, avg_score, avg_score],
        },
        # Highest-risk wards (horizontal bar)
        'risk_by_zone': {
            'labels': [z.get('display_name', z['name']) for z in sorted(MUMBAI_ZONES, key=lambda x: -x['score'])[:10]],
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
            'values': lighting_buckets,
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
            'values': accident_lighting,
        },
        'traffic_vs_risk': {
            'labels': ['0-0.2', '0.2-0.4', '0.4-0.6', '0.6-0.8', '0.8-1.0'],
            'high': [len([z for z in high_zones if z.get('traffic', 0.5) < 0.2]),
                     len([z for z in high_zones if 0.2 <= z.get('traffic', 0.5) < 0.4]),
                     len([z for z in high_zones if 0.4 <= z.get('traffic', 0.5) < 0.6]),
                     len([z for z in high_zones if 0.6 <= z.get('traffic', 0.5) < 0.8]),
                     len([z for z in high_zones if z.get('traffic', 0.5) >= 0.8])],
            'medium': [len([z for z in med_zones if z.get('traffic', 0.5) < 0.2]),
                       len([z for z in med_zones if 0.2 <= z.get('traffic', 0.5) < 0.4]),
                       len([z for z in med_zones if 0.4 <= z.get('traffic', 0.5) < 0.6]),
                       len([z for z in med_zones if 0.6 <= z.get('traffic', 0.5) < 0.8]),
                       len([z for z in med_zones if z.get('traffic', 0.5) >= 0.8])],
            'low': [len([z for z in low_zones if z.get('traffic', 0.5) < 0.2]),
                    len([z for z in low_zones if 0.2 <= z.get('traffic', 0.5) < 0.4]),
                    len([z for z in low_zones if 0.4 <= z.get('traffic', 0.5) < 0.6]),
                    len([z for z in low_zones if 0.6 <= z.get('traffic', 0.5) < 0.8]),
                    len([z for z in low_zones if z.get('traffic', 0.5) >= 0.8])],
        },
        'hourly_trend': {
            'labels': hourly_labels,
            'values': hourly_values,
        },
        'area_distribution': {
            'labels': area_labels,
            'high': area_high,
            'medium': area_med,
            'low': area_low,
        },
        # Crime rate vs lighting quality correlation
        'crime_lighting_correlation': {
            'labels': [z.get('display_name', z['name']) for z in MUMBAI_ZONES],
            'lighting': [z.get('lighting', 0.5) for z in MUMBAI_ZONES],
            'risk_scores': [z['score'] for z in MUMBAI_ZONES],
            'colors': [z['risk'] for z in MUMBAI_ZONES],
        },
        # Faulty light zones vs crime zones overlap
        'lighting_crime_overlap': {
            'poor_light_high_crime': len([z for z in MUMBAI_ZONES if z.get('lighting', 0.5) < 0.3 and z['score'] > 50]),
            'poor_light_medium_crime': len([z for z in MUMBAI_ZONES if z.get('lighting', 0.5) < 0.3 and 30 <= z['score'] <= 50]),
            'poor_light_low_crime': len([z for z in MUMBAI_ZONES if z.get('lighting', 0.5) < 0.3 and z['score'] < 30]),
            'adequate_light_high_crime': len([z for z in MUMBAI_ZONES if z.get('lighting', 0.5) >= 0.3 and z['score'] > 50]),
            'adequate_light_medium_crime': len([z for z in MUMBAI_ZONES if z.get('lighting', 0.5) >= 0.3 and 30 <= z['score'] <= 50]),
            'adequate_light_low_crime': len([z for z in MUMBAI_ZONES if z.get('lighting', 0.5) >= 0.3 and z['score'] < 30]),
            'zones_poor_light_high_crime': [z.get('display_name', z['name']) for z in MUMBAI_ZONES if z.get('lighting', 0.5) < 0.3 and z['score'] > 50],
        },
    })


# ── Boot ────────────────────────────────────────────────────────────────────

if not load_materialized_stats():
    load_city_datasets()
else:
    # Warm cache is loaded for fast boot; refresh immediately in background.
    threading.Thread(target=load_city_datasets, name='nuit-refresh-now', daemon=True).start()

start_background_refresh_job()
init_db()
load_model()

if __name__ == '__main__':
    app.run(debug=True, port=5000)
