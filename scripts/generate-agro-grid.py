"""Build a compact regional screening grid from the Alpha Turkistan Sentinel-2 COG.

The output is intentionally coarse. It is suitable for investor screening and
map interaction, but it is not a cadastral, soil-laboratory or agronomic map.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.enums import Resampling
from rasterio.features import geometry_mask
from rasterio.windows import from_bounds
from shapely.geometry import box, mapping, shape
from shapely.ops import transform


def safe_index(numerator: np.ndarray, denominator: np.ndarray) -> np.ndarray:
    result = np.full(numerator.shape, np.nan, dtype=np.float32)
    np.divide(numerator, denominator, out=result, where=np.abs(denominator) > 1e-6)
    return np.clip(result, -1.0, 1.0)


def robust_norm(value: float, low: float, high: float) -> float:
    if not math.isfinite(value) or high <= low:
        return 0.5
    return float(np.clip((value - low) / (high - low), 0.0, 1.0))


def round_number(value: float, digits: int = 3) -> float:
    return round(float(value), digits)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--cog",
        default=r"D:\data\mosaics\2025_summer\s2_mosaic_cog.tif",
        help="Seven-band Alpha Turkistan Sentinel-2 COG",
    )
    parser.add_argument(
        "--boundary",
        default=r"C:\Users\USER\alpha-turkestan\frontend\public\turkestan_boundary.geojson",
    )
    parser.add_argument("--output", default=r"public\data\agro-suitability.geojson")
    parser.add_argument("--boundary-output", default=r"public\data\turkistan-boundary.geojson")
    parser.add_argument("--cell-km", type=float, default=18.0)
    args = parser.parse_args()

    cog_path = Path(args.cog)
    boundary_path = Path(args.boundary)
    output_path = Path(args.output)
    boundary_output_path = Path(args.boundary_output)
    if not cog_path.exists():
        raise SystemExit(f"COG not found: {cog_path}")
    if not boundary_path.exists():
        raise SystemExit(f"Boundary not found: {boundary_path}")

    boundary_geojson = json.loads(boundary_path.read_text(encoding="utf-8"))
    boundary_wgs84 = shape(boundary_geojson["features"][0]["geometry"])
    to_utm = Transformer.from_crs("EPSG:4326", "EPSG:32641", always_xy=True).transform
    to_wgs84 = Transformer.from_crs("EPSG:32641", "EPSG:4326", always_xy=True).transform
    boundary_utm = transform(to_utm, boundary_wgs84)

    cell_size = args.cell_km * 1000.0
    minx, miny, maxx, maxy = boundary_utm.bounds
    minx = math.floor(minx / cell_size) * cell_size
    miny = math.floor(miny / cell_size) * cell_size
    maxx = math.ceil(maxx / cell_size) * cell_size
    maxy = math.ceil(maxy / cell_size) * cell_size

    records: list[dict] = []
    with rasterio.open(cog_path) as src:
        if src.count < 7:
            raise SystemExit(f"Expected seven Sentinel-2 bands, found {src.count}")

        row_index = 0
        y = miny
        while y < maxy:
            col_index = 0
            x = minx
            while x < maxx:
                square = box(x, y, x + cell_size, y + cell_size)
                clipped = square.intersection(boundary_utm)
                area_ratio = clipped.area / square.area if not clipped.is_empty else 0.0
                if area_ratio >= 0.08:
                    raster_bounds = clipped.bounds
                    window = from_bounds(*raster_bounds, transform=src.transform).round_offsets().round_lengths()
                    window = window.intersection(rasterio.windows.Window(0, 0, src.width, src.height))
                    sample_size = 44
                    bands = src.read(
                        [1, 2, 3, 4, 5, 6, 7],
                        window=window,
                        out_shape=(7, sample_size, sample_size),
                        masked=True,
                        resampling=Resampling.average,
                    )
                    sample_transform = rasterio.transform.from_bounds(
                        *raster_bounds, width=sample_size, height=sample_size
                    )
                    inside = geometry_mask(
                        [mapping(clipped)],
                        out_shape=(sample_size, sample_size),
                        transform=sample_transform,
                        invert=True,
                    )
                    raw = np.asarray(bands.filled(np.nan), dtype=np.float32)
                    valid = inside & np.all(np.isfinite(raw), axis=0) & np.all(raw > -100, axis=0)

                    if int(valid.sum()) >= 30:
                        b02, b03, b04, b05, b08, _b8a, b11 = raw
                        indices = {
                            "ndvi": safe_index(b08 - b04, b08 + b04),
                            "ndwi": safe_index(b03 - b08, b03 + b08),
                            "ndre": safe_index(b08 - b05, b08 + b05),
                            "ndmi": safe_index(b08 - b11, b08 + b11),
                            "ndbi": safe_index(b11 - b08, b11 + b08),
                            "bsi": safe_index((b11 + b04) - (b08 + b02), (b11 + b04) + (b08 + b02)),
                        }
                        metrics = {
                            key: float(np.nanmedian(values[valid])) for key, values in indices.items()
                        }
                        active_share = float(np.mean(indices["ndvi"][valid] > 0.18))
                        water_share = float(np.mean(indices["ndwi"][valid] > 0.0))
                        centroid = transform(to_wgs84, clipped.centroid)
                        geometry_wgs84 = transform(to_wgs84, clipped.simplify(180, preserve_topology=True))
                        records.append(
                            {
                                "id": f"agro-{row_index}-{col_index}",
                                "geometry": mapping(geometry_wgs84),
                                "properties": {
                                    "cell_id": f"TKO-{row_index:02d}-{col_index:02d}",
                                    "latitude": round_number(centroid.y, 5),
                                    "longitude": round_number(centroid.x, 5),
                                    "area_km2": round_number(clipped.area / 1_000_000, 1),
                                    "coverage_pct": round_number(area_ratio * 100, 1),
                                    "sample_count": int(valid.sum()),
                                    "active_vegetation_pct": round_number(active_share * 100, 1),
                                    "surface_water_pct": round_number(water_share * 100, 1),
                                    **{key: round_number(value) for key, value in metrics.items()},
                                },
                            }
                        )
                x += cell_size
                col_index += 1
            y += cell_size
            row_index += 1

    if not records:
        raise SystemExit("No valid grid cells were produced")

    metric_keys = ["ndvi", "ndwi", "ndre", "ndmi", "ndbi", "bsi"]
    ranges: dict[str, tuple[float, float]] = {}
    for key in metric_keys:
        values = np.array([record["properties"][key] for record in records], dtype=float)
        ranges[key] = (float(np.percentile(values, 10)), float(np.percentile(values, 90)))

    for record in records:
        props = record["properties"]
        norm = {key: robust_norm(props[key], *ranges[key]) for key in metric_keys}
        vegetation = norm["ndvi"]
        moisture = norm["ndmi"]
        surface_water = norm["ndwi"]
        bare = norm["bsi"]
        built_or_dry = norm["ndbi"]
        red_edge = norm["ndre"]
        water_presence = float(np.clip(props["surface_water_pct"] / 5.0, 0.0, 1.0))

        rice_base = (
            0.32 * moisture
            + 0.20 * surface_water
            + 0.18 * vegetation
            + 0.12 * red_edge
            + 0.10 * (1 - bare)
            + 0.08 * (1 - built_or_dry)
        )

        scores = {
            "soy": 100 * (0.38 * vegetation + 0.26 * moisture + 0.18 * red_edge + 0.10 * (1 - bare) + 0.08 * (1 - built_or_dry)),
            # Rice is explicitly penalized when the 2025 mosaic contains no
            # nearby open-water signature. Irrigation and water rights still
            # require field verification even in high-scoring cells.
            "rice": 100 * rice_base * (0.45 + 0.55 * water_presence),
            "cotton": 100 * (0.36 * vegetation + 0.23 * moisture + 0.16 * red_edge + 0.13 * surface_water + 0.12 * (1 - built_or_dry)),
            "vegetables": 100 * (0.33 * vegetation + 0.27 * moisture + 0.20 * surface_water + 0.12 * red_edge + 0.08 * (1 - bare)),
            "solar": 100 * (0.42 * bare + 0.28 * (1 - vegetation) + 0.20 * built_or_dry + 0.10 * (1 - surface_water)),
            "industrial_land": 100 * (0.40 * built_or_dry + 0.27 * bare + 0.20 * (1 - vegetation) + 0.13 * (1 - surface_water)),
        }
        rounded_scores = {key: int(round(float(np.clip(value, 0, 100)))) for key, value in scores.items()}
        crop_scores = {key: rounded_scores[key] for key in ("soy", "rice", "cotton", "vegetables")}
        best_crop = max(crop_scores, key=crop_scores.get)
        confidence = int(round(55 + min(40, props["sample_count"] / 44 / 44 * 40)))
        props.update(rounded_scores)
        props["best_crop"] = best_crop
        props["confidence"] = confidence
        props["period"] = "2025_summer"

    output = {
        "type": "FeatureCollection",
        "metadata": {
            "title": "Alpha Turkistan regional remote-sensing screening grid",
            "source": "Alpha Turkistan Sentinel-2 L2A 2025 summer COG",
            "cell_size_km": args.cell_km,
            "method": "Median spectral indices per clipped grid cell; crop scores are relative screening scores, not soil or yield certification.",
            "indices": metric_keys,
            "normalization_percentiles": {
                key: {"p10": round_number(value[0]), "p90": round_number(value[1])}
                for key, value in ranges.items()
            },
            "limitations": [
                "Satellite indices do not replace soil chemistry, salinity, drainage, slope or water-rights checks.",
                "NDBI can confuse dry bare soil with built-up land in arid regions.",
                "Crop scores rank relative conditions observed in the regional 2025 summer mosaic.",
            ],
        },
        "features": [
            {"type": "Feature", "id": record["id"], "properties": record["properties"], "geometry": record["geometry"]}
            for record in records
        ],
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    boundary_output_path.parent.mkdir(parents=True, exist_ok=True)
    boundary_output_path.write_text(
        json.dumps(boundary_geojson, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "cells": len(records),
                "output": str(output_path),
                "bytes": output_path.stat().st_size,
                "cell_km": args.cell_km,
                "ranges": {key: [round_number(v[0]), round_number(v[1])] for key, v in ranges.items()},
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
