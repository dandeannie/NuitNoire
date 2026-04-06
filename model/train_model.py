import os
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
import joblib

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, '..', 'data')
OUT = os.path.join(ROOT, 'model.pkl')

FEATURES = ['lighting_level', 'traffic_density', 'area_encoded', 'time_hour', 'accident_history']
AREA_ENC = {'urban': 0, 'suburban': 1, 'rural': 2}


def load():
    acc = pd.read_csv(os.path.join(DATA, 'accidents.csv'))
    lit = pd.read_csv(os.path.join(DATA, 'lighting.csv'))
    trf = pd.read_csv(os.path.join(DATA, 'traffic.csv'))
    return acc, lit, trf


def build_features(acc, lit, trf):
    df = acc.copy()
    df['area_encoded'] = df['area_type'].map(AREA_ENC)
    df['accident_history'] = df['severity']

    lit_avg = lit.groupby('zone_id')['lighting_intensity'].mean()
    trf_avg = trf.groupby(['zone_id', 'hour'])['traffic_density'].mean().reset_index()

    X = df[FEATURES].copy()
    y = df['severity']
    return X, y


def synthesize(X, y, n=500):
    rng = np.random.RandomState(42)
    rows, labels = [], []
    profiles = {
        2: dict(light=(0.0, 0.30), traffic=(0.0, 0.25), area=[1, 2], hours=[0, 1, 2, 3, 23], hist=[1, 2]),
        1: dict(light=(0.25, 0.60), traffic=(0.20, 0.55), area=[0, 1], hours=[20, 21, 22, 23], hist=[0, 1]),
        0: dict(light=(0.55, 1.0), traffic=(0.45, 1.0), area=[0], hours=[20, 21], hist=[0]),
    }
    for _ in range(n):
        risk = rng.choice([0, 1, 2])
        p = profiles[risk]
        rows.append([
            rng.uniform(*p['light']),
            rng.uniform(*p['traffic']),
            rng.choice(p['area']),
            rng.choice(p['hours']),
            rng.choice(p['hist']),
        ])
        labels.append(risk)

    Xs = pd.DataFrame(rows, columns=FEATURES)
    ys = pd.Series(labels)
    return pd.concat([X, Xs], ignore_index=True), pd.concat([y, ys], ignore_index=True)


def train():
    acc, lit, trf = load()
    X, y = build_features(acc, lit, trf)
    X, y = synthesize(X, y)
    print(f"Training on {len(X)} samples")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    clf = RandomForestClassifier(
        n_estimators=200, max_depth=10, min_samples_split=5,
        random_state=42, class_weight='balanced',
    )
    clf.fit(X_train, y_train)

    y_pred = clf.predict(X_test)
    print("\n" + classification_report(y_test, y_pred, target_names=['Low', 'Medium', 'High']))

    joblib.dump(clf, OUT)
    print(f"Saved to {OUT}")

    for name, imp in zip(FEATURES, clf.feature_importances_):
        print(f"  {name}: {imp:.4f}")


if __name__ == '__main__':
    train()
