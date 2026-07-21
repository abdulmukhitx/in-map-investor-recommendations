"""Keep a browser-friendly electricity overlay after distance enrichment."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def perpendicular_distance(point, start, end):
    if start == end:
        return ((point[0] - start[0]) ** 2 + (point[1] - start[1]) ** 2) ** 0.5
    dx, dy = end[0] - start[0], end[1] - start[1]
    t = max(0.0, min(1.0, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy)))
    nearest = (start[0] + t * dx, start[1] + t * dy)
    return ((point[0] - nearest[0]) ** 2 + (point[1] - nearest[1]) ** 2) ** 0.5


def simplify(points, tolerance=0.00035):
    if len(points) <= 2:
        return points
    best_distance, best_index = 0.0, 0
    for index in range(1, len(points) - 1):
        distance = perpendicular_distance(points[index], points[0], points[-1])
        if distance > best_distance:
            best_distance, best_index = distance, index
    if best_distance <= tolerance:
        return [points[0], points[-1]]
    return simplify(points[: best_index + 1], tolerance)[:-1] + simplify(points[best_index:], tolerance)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default=r"public\data\region-infrastructure.geojson")
    parser.add_argument("--output", default=r"public\data\region-infrastructure.geojson")
    args = parser.parse_args()
    source = json.loads(Path(args.input).read_text(encoding="utf-8"))
    features = []
    for feature in source.get("features", []):
        kind = feature.get("properties", {}).get("kind")
        if kind not in {"power_line", "substation", "power_source"}:
            continue
        geometry = feature.get("geometry") or {}
        if geometry.get("type") == "LineString":
            geometry["coordinates"] = simplify(geometry.get("coordinates") or [])
        feature["properties"] = {
            key: value
            for key, value in feature.get("properties", {}).items()
            if key in {"kind", "name", "voltage_kv", "operator", "detail", "osm_url"} and value is not None
        }
        features.append(feature)
    source["features"] = features
    source["metadata"]["browser_layer"] = "Electricity only; rail and water are loaded around a selected zone."
    output = Path(args.output)
    output.write_text(json.dumps(source, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({"features": len(features), "bytes": output.stat().st_size}, ensure_ascii=False))


if __name__ == "__main__":
    main()
