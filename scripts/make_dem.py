"""Fabrique les deux fichiers de relief de data/raw/ à partir des dalles BD ALTI 25 m (IGN).

Entrée : un dossier contenant les dalles .asc des départements 2A et 2B, décompressées depuis
  https://data.geopf.fr/telechargement/resource/BDALTI?zone=D02A (et D02B)
Sorties :
  data/raw/corse_mnt.tif      relief 25 m découpé autour du tracé (+3 km de marge)
  data/raw/corse_ile_200m.tif île entière à 200 m, mer à -30 m (sert de décor autour de la zone détaillée)

Lancement : python3 scripts/make_dem.py CHEMIN/VERS/LES/DALLES
"""
import glob
import sys
from pathlib import Path

import gpxpy
import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.merge import merge
from rasterio.transform import Affine
from pyproj import Transformer

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
L93 = CRS.from_epsg(2154)


def write(path, a, transform):
    with rasterio.open(path, "w", driver="GTiff", height=a.shape[0], width=a.shape[1], count=1,
                       dtype="float32", crs=L93, transform=transform, compress="deflate", predictor=3) as d:
        d.write(a.astype("float32"), 1)


def main(tiles_dir):
    files = sorted(glob.glob(str(Path(tiles_dir) / "**" / "*.asc"), recursive=True))
    srcs = [rasterio.open(f) for f in files]

    # 1. zone détaillée autour du tracé
    gpx = gpxpy.parse((RAW / "gr20.gpx").read_text())
    pts = [p for t in gpx.tracks for s in t.segments for p in s.points]
    xs, ys = Transformer.from_crs(4326, 2154, always_xy=True).transform(
        [p.longitude for p in pts], [p.latitude for p in pts])
    m = 3000
    x0 = np.floor((min(xs) - m - 12.5) / 50) * 50 + 12.5
    x1 = np.ceil((max(xs) + m - 12.5) / 50) * 50 + 12.5
    y0 = np.floor((min(ys) - m - 12.5) / 50) * 50 + 12.5
    y1 = np.ceil((max(ys) + m - 12.5) / 50) * 50 + 12.5
    arr, tf = merge(srcs, bounds=(x0, y0, x1, y1))
    a = arr[0]
    a[a <= -9999] = 0
    write(RAW / "corse_mnt.tif", a, tf)

    # 2. île entière à 200 m
    arr, tf = merge(srcs)
    a = arr[0]
    f = 8
    h, w = (a.shape[0] // f) * f, (a.shape[1] // f) * f
    blk = a[:h, :w].reshape(h // f, f, w // f, f)
    land = blk > -9999
    frac = land.mean(axis=(1, 3))
    s = np.where(land, blk, 0).sum(axis=(1, 3))
    island = np.where(frac >= 0.5, s / np.maximum(land.sum(axis=(1, 3)), 1), -30.0)
    island = np.where(frac >= 0.5, np.maximum(island, 1.0), island)
    write(RAW / "corse_ile_200m.tif", island, tf * Affine.scale(f))


if __name__ == "__main__":
    main(sys.argv[1])
