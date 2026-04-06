# Nuit Noire

Nuit Noire is a location-first night safety intelligence platform for Mumbai. It combines geospatial data, risk scoring, and route analysis to help users make safer travel decisions after dark.

## Highlights

- Explore map with thematic layers:
  - Risk zones
  - Crime hotspots
  - Faulty street lights
  - Combined risk
  - Road corridor risk
- Safer route analysis with ranked alternatives (safety/time/budget)
- Location-first route input with progressive landmark fallback
- Voice-assisted route commands and readout
- Predict page with zone-aware risk scoring
- Analytics dashboard with interactive filters
- Ward Intelligence page for deep area diagnostics
- Incident reporting flow with admin status updates
- Background data refresh and materialized cache support

## Project Structure

- `app.py` - Flask backend, APIs, data loading, scoring, routing
- `templates/` - HTML pages
- `static/js/` - Frontend logic (map, route, analytics, predict, voice)
- `static/css/styles.css` - Shared styling
- `database/` - SQLite DB and cache artifacts
- `model/` - Model training and model artifact
- `data/` - Source datasets (not required to be committed in updates)

## Main Pages

- `/` Home
- `/explore` Route planning and map layers
- `/predict` Risk predictor
- `/analytics` Dashboard and trends
- `/ward-intelligence` Area/ward deep dive
- `/report` Incident reporting
- `/about` Product and architecture overview

## Key API Endpoints

- `GET /api/zones-list`
- `GET /api/zones-detail`
- `GET /api/risk-zones`
- `POST /api/analyze-route`
- `POST /api/route-alternatives`
- `POST /api/zone-predict`
- `POST /api/predict-risk`
- `GET /api/insights-data`
- `GET /api/location-suggestions`
- `GET /api/ward-profile`
- `GET /api/road-segments`
- `GET /api/cache-status`
- `POST /api/refresh-data`

## Setup

1. Create and activate a virtual environment.
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Run the app:

```bash
python app.py
```

4. Open:

- `http://127.0.0.1:5000`

## Notes

- This project is intended for safety decision support.
- Keep dataset files in `data/` local if needed for your workflow.
- The repository updates can be pushed without dataset changes.
