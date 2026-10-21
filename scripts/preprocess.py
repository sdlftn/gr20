"""Prétraitement des données du site GR20.

Entrées  : data/raw/gr20.gpx, data/raw/corse_mnt.tif (Lambert-93), data/stops.json
Sorties  : public/data/*.json, heightmaps PNG et textures du relief.

Lancement : python3 scripts/preprocess.py
Dépendances : numpy rasterio pyproj gpxpy pillow
"""
import json
import math
from pathlib import Path

import gpxpy
import numpy as np
import rasterio
from PIL import Image
from pyproj import Transformer

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "public" / "data"
OUT.mkdir(parents=True, exist_ok=True)

TO_L93 = Transformer.from_crs(4326, 2154, always_xy=True)


# ---------------------------------------------------------------- tracé
def load_track():
    gpx = gpxpy.parse((RAW / "gr20.gpx").read_text())
    pts = [p for t in gpx.tracks for s in t.segments for p in s.points]
    lat = np.array([p.latitude for p in pts])
    lon = np.array([p.longitude for p in pts])
    ele = np.array([p.elevation for p in pts], dtype=float)
    x, y = TO_L93.transform(lon, lat)
    return lat, lon, np.asarray(x), np.asarray(y), ele


def cumulative_km(x, y):
    d = np.hypot(np.diff(x), np.diff(y))
    return np.concatenate([[0.0], np.cumsum(d)]) / 1000.0


def smooth(v, n=5):
    if n <= 1:
        return v
    k = np.ones(n) / n
    pad = np.pad(v, (n // 2, n // 2), mode="edge")
    return np.convolve(pad, k, mode="valid")


def climb(ele, threshold=5.0):
    """D+ / D- avec hystérésis, pour ne pas compter le bruit d'altitude."""
    up = down = 0.0
    ref = ele[0]
    for e in ele[1:]:
        if e - ref >= threshold:
            up += e - ref
            ref = e
        elif ref - e >= threshold:
            down += ref - e
            ref = e
    return up, down


def snap_stops(stops, x, y):
    """Recale chaque arrêt sur le point du tracé le plus proche, dans l'ordre du parcours."""
    idx, start = [], 0
    for i, s in enumerate(stops):
        sx, sy = TO_L93.transform(s["lon"], s["lat"])
        if i == 0:
            j = 0
        elif i == len(stops) - 1:
            j = len(x) - 1
        else:
            d = np.hypot(x[start:] - sx, y[start:] - sy)
            j = start + int(np.argmin(d))
        s["snap_m"] = round(float(math.hypot(x[j] - sx, y[j] - sy)))
        idx.append(j)
        start = j
    return idx


# ---------------------------------------------------------------- relief
def export_heightmap(z, step_name):
    """Altitude codée sur R (octet fort) et G (octet faible), en décimètres."""
    v = np.clip(np.round(z * 10), 0, 65535).astype(np.uint16)
    rgb = np.zeros((*v.shape, 3), dtype=np.uint8)
    rgb[..., 0] = v >> 8
    rgb[..., 1] = v & 255
    Image.fromarray(rgb, "RGB").save(OUT / f"terrain_{step_name}.png", optimize=True)


def baked_texture(z, cell, name, max_side):
    """Texture du relief : graphite, ombrage rasant, crêtes légèrement éclairées."""
    gy, gx = np.gradient(z, cell)
    slope = np.arctan(np.hypot(gx, gy) * 1.6)
    aspect = np.arctan2(-gx, gy)
    az, alt = math.radians(300), math.radians(30)
    shade = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)
    shade = np.clip(shade, 0, 1)

    # gris sombre légèrement bleuté, plus clair en altitude
    t = np.clip(z / 2700.0, 0, 1)[..., None]
    low = np.array([30, 33, 38], dtype=float)
    high = np.array([74, 77, 83], dtype=float)
    base = low + (high - low) * t
    light = shade[..., None] ** 1.25
    img = base * (0.34 + 1.05 * light) + np.array([3, 5, 9]) * (1 - light)
    img[z <= 0] = (11, 16, 23)  # mer
    img = np.clip(img, 0, 255).astype(np.uint8)
    im = Image.fromarray(img, "RGB")
    scale = max_side / max(im.size)
    if scale < 1:
        im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    im.save(OUT / f"{name}.jpg", quality=84, optimize=True, progressive=True)
    return im.size


def block_mean(a, f):
    h, w = (a.shape[0] // f) * f, (a.shape[1] // f) * f
    return a[:h, :w].reshape(h // f, f, w // f, f).mean(axis=(1, 3))


def main():
    stops_doc = json.loads((ROOT / "data" / "stops.json").read_text())
    stops = stops_doc["stops"]

    lat, lon, x, y, ele_gpx = load_track()
    with rasterio.open(RAW / "corse_mnt.tif") as dem:
        z25 = dem.read(1).astype(float)
        b = dem.bounds
        # altitude du tracé lue dans le MNT IGN (plus cohérente que l'altitude du GPX)
        rows, cols = rasterio.transform.rowcol(dem.transform, x, y)
    rows = np.clip(np.asarray(rows), 0, z25.shape[0] - 1)
    cols = np.clip(np.asarray(cols), 0, z25.shape[1] - 1)
    ele_dem = z25[rows, cols]
    ele = smooth(ele_dem, 3)

    km = cumulative_km(x, y)
    idx = snap_stops(stops, x, y)

    texts = json.loads((ROOT / "data" / "stage_texts.json").read_text())
    stages = []
    for n in range(len(stops) - 1):
        a, c = idx[n], idx[n + 1]
        up, down = climb(ele[a:c + 1])
        stages.append({
            "n": n + 1,
            "from": stops[n]["id"],
            "to": stops[n + 1]["id"],
            "from_name": stops[n]["name"],
            "to_name": stops[n + 1]["name"],
            "km": round(km[c] - km[a], 1),
            "up": int(round(up, -1)),
            "down": int(round(down, -1)),
            "max_alt": int(round(ele[a:c + 1].max())),
            "start_km": round(km[a], 2),
            "end_km": round(km[c], 2),
        })

    for st in stages:
        st["text"] = texts[str(st["n"])]
        st["conseil"] = texts["conseils"].get(str(st["n"]))

    up_all, down_all = climb(ele)
    summary = {
        "km": round(km[-1], 1),
        "up": int(round(up_all, -1)),
        "down": int(round(down_all, -1)),
        "max_alt": int(round(ele.max())),
        "stages": len(stages),
        "refuges": sum(1 for s in stops if s["type"] == "refuge"),
    }

    days = []
    by_n = {s["n"]: s for s in stages}
    names = {s["id"]: s["name"] for s in stops}
    for d in stops_doc["trek"]["days"]:
        ss = [by_n[n] for n in d["stages"]]
        days.append({
            "day": d["day"],
            "stages": d["stages"],
            "from_name": ss[0]["from_name"],
            "to_name": ss[-1]["to_name"],
            "night": names[d["night"]] if d["night"] != "conca" else None,
            "reseau": texts["reseau"].get(d["night"], "incertain"),
            "km": round(sum(s["km"] for s in ss), 1),
            "up": sum(s["up"] for s in ss),
            "down": sum(s["down"] for s in ss),
            "doubled": len(ss) > 1,
            "start_km": ss[0]["start_km"],
            "end_km": ss[-1]["end_km"],
        })

    # tracé simplifié pour le navigateur : un point tous les ~40 m, coordonnées locales en mètres
    keep = [0]
    for i in range(1, len(x)):
        if math.hypot(x[i] - x[keep[-1]], y[i] - y[keep[-1]]) >= 40:
            keep.append(i)
    if keep[-1] != len(x) - 1:
        keep.append(len(x) - 1)
    keep = np.array(keep)
    track = {
        "origin": "coin sud-ouest du relief (Lambert-93)",
        "x": [round(float(v - b.left), 1) for v in x[keep]],
        "y": [round(float(v - b.bottom), 1) for v in y[keep]],
        "z": [round(float(v), 1) for v in ele[keep]],
        "km": [round(float(v), 3) for v in km[keep]],
    }
    stop_out = [{
        "id": s["id"], "name": s["name"], "type": s["type"],
        "x": round(float(x[i] - b.left), 1), "y": round(float(y[i] - b.bottom), 1),
        "z": round(float(ele[i])), "km": round(float(km[i]), 2), "snap_m": s["snap_m"],
    } for s, i in zip(stops, idx)]

    # relief pour le navigateur
    z100 = block_mean(z25, 4)
    z50 = block_mean(z25, 2)
    export_heightmap(z50, "50m")
    export_heightmap(z100, "100m")
    tex_hi = baked_texture(z25, 25.0, "texture_hi", 3072)
    tex_lo = baked_texture(z50, 50.0, "texture_lo", 1536)

    # île entière autour de la zone détaillée (décor), mer à -30 m
    with rasterio.open(RAW / "corse_ile_200m.tif") as isl:
        zi = isl.read(1).astype(float)
        ib = isl.bounds
    zi_lo = block_mean(zi, 2)
    export_heightmap(np.maximum(zi, 0) + 0, "ile_200m")
    export_heightmap(np.maximum(zi_lo, 0), "ile_400m")
    # le PNG ne code pas les altitudes négatives : la mer est repérée par la valeur 0
    isl_tex = baked_texture(zi, 200.0, "texture_ile", 1125)

    terrain = {
        "width_m": round(b.right - b.left, 1),
        "height_m": round(b.top - b.bottom, 1),
        "max_alt": float(round(z25.max(), 1)),
        "heightmaps": {
            "50m": {"file": "terrain_50m.png", "cols": int(z50.shape[1]), "rows": int(z50.shape[0])},
            "100m": {"file": "terrain_100m.png", "cols": int(z100.shape[1]), "rows": int(z100.shape[0])},
        },
        "textures": {"hi": {"file": "texture_hi.jpg", "size": tex_hi}, "lo": {"file": "texture_lo.jpg", "size": tex_lo}},
        "island": {
            "x0": round(ib.left - b.left, 1), "y0": round(ib.bottom - b.bottom, 1),
            "width_m": round(ib.right - ib.left, 1), "height_m": round(ib.top - ib.bottom, 1),
            "heightmaps": {
                "200m": {"file": "terrain_ile_200m.png", "cols": int(zi.shape[1]), "rows": int(zi.shape[0])},
                "400m": {"file": "terrain_ile_400m.png", "cols": int(zi_lo.shape[1]), "rows": int(zi_lo.shape[0])},
            },
            "texture": {"file": "texture_ile.jpg", "size": isl_tex},
            "note": "altitude 0 = mer",
        },
        "encoding": "altitude_dm = R*256 + G (PNG RGB) ; ligne 0 = nord",
        "credits": ["Relief : BD ALTI® IGN (Licence Ouverte Etalab 2.0)",
                    "Tracé et refuges : © contributeurs OpenStreetMap (ODbL), via mongr20.com"],
    }

    summary["depart"] = stops_doc["trek"].get("depart", {})
    photos = json.loads((ROOT / "data" / "photos.json").read_text())
    for name, obj in [("photos", photos), ("summary", summary), ("stages", stages), ("days", days),
                      ("track", track), ("stops", stop_out), ("terrain", terrain)]:
        (OUT / f"{name}.json").write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")))

    # tableau de contrôle
    print(f"Total : {summary['km']} km, +{summary['up']} m / -{summary['down']} m, "
          f"point culminant {summary['max_alt']} m")
    print(f"{'N°':>2}  {'Étape':<40} {'km':>5} {'D+':>6} {'D-':>6}  recalage")
    for s, st in zip(stages, stops[1:]):
        print(f"{s['n']:>2}  {s['from_name'] + ' → ' + s['to_name']:<40} {s['km']:>5} "
              f"{s['up']:>6} {s['down']:>6}  {st['snap_m']} m")
    print("\nJours :")
    for d in days:
        print(f"J{d['day']:<2} {d['from_name']} → {d['to_name']}: {d['km']} km, +{d['up']} / -{d['down']}"
              + ("  (doublé)" if d["doubled"] else ""))


if __name__ == "__main__":
    main()
