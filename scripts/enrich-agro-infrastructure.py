"""Attach nearest mapped infrastructure distances to every agro screening cell.

Distances are calculated to line segments (not feature centroids). They indicate
mapped proximity only and never imply spare capacity, a connection right, water
availability, or a permit.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path


EARTH_KM = 6371.0088


def geometry_paths(geometry: dict) -> list[list[list[float]]]:
    kind = geometry.get("type")
    coordinates = geometry.get("coordinates") or []
    if kind == "Point":
        return [[coordinates]]
    if kind == "LineString":
        return [coordinates]
    if kind == "MultiLineString":
        return coordinates
    if kind == "Polygon":
        return coordinates
    if kind == "MultiPolygon":
        return [ring for polygon in coordinates for ring in polygon]
    return []


def project(lon: float, lat: float, origin_lon: float, origin_lat: float) -> tuple[float, float]:
    x = math.radians(lon - origin_lon) * EARTH_KM * math.cos(math.radians(origin_lat))
    y = math.radians(lat - origin_lat) * EARTH_KM
    return x, y


def point_segment_distance_km(lat: float, lon: float, start: list[float], end: list[float]) -> float:
    ax, ay = project(float(start[0]), float(start[1]), lon, lat)
    bx, by = project(float(end[0]), float(end[1]), lon, lat)
    denominator = (bx - ax) ** 2 + (by - ay) ** 2
    if denominator == 0:
        return math.hypot(ax, ay)
    t = max(0.0, min(1.0, -(ax * (bx - ax) + ay * (by - ay)) / denominator))
    return math.hypot(ax + t * (bx - ax), ay + t * (by - ay))


def distance_to_geometry(lat: float, lon: float, geometry: dict) -> float:
    best = float("inf")
    for path in geometry_paths(geometry):
        if len(path) == 1:
            x, y = project(float(path[0][0]), float(path[0][1]), lon, lat)
            best = min(best, math.hypot(x, y))
        else:
            for start, end in zip(path, path[1:]):
                best = min(best, point_segment_distance_km(lat, lon, start, end))
    return best


def nearest(lat: float, lon: float, features: list[dict]) -> float | None:
    distances = [distance_to_geometry(lat, lon, feature["geometry"]) for feature in features]
    finite = [value for value in distances if math.isfinite(value)]
    return round(min(finite), 1) if finite else None


def build_segment_index(features: list[dict], cell_size: float = 0.25) -> dict[tuple[int, int], list[tuple[tuple[float, float], tuple[float, float]]]]:
    index: dict[tuple[int, int], list[tuple[tuple[float, float], tuple[float, float]]]] = {}
    for feature in features:
        for path in geometry_paths(feature["geometry"]):
            if len(path) == 1:
                segments = [(path[0], path[0])]
            else:
                segments = list(zip(path, path[1:]))
            for start, end in segments:
                min_x = math.floor(min(start[0], end[0]) / cell_size)
                max_x = math.floor(max(start[0], end[0]) / cell_size)
                min_y = math.floor(min(start[1], end[1]) / cell_size)
                max_y = math.floor(max(start[1], end[1]) / cell_size)
                segment = ((float(start[0]), float(start[1])), (float(end[0]), float(end[1])))
                for x in range(min_x, max_x + 1):
                    for y in range(min_y, max_y + 1):
                        index.setdefault((x, y), []).append(segment)
    return index


def nearest_indexed(lat: float, lon: float, index: dict, cell_size: float = 0.25) -> float | None:
    center_x = math.floor(lon / cell_size)
    center_y = math.floor(lat / cell_size)
    candidates: set[tuple[tuple[float, float], tuple[float, float]]] = set()
    for ring in range(0, 17):
        for x in range(center_x - ring, center_x + ring + 1):
            for y in range(center_y - ring, center_y + ring + 1):
                if ring and center_x - ring < x < center_x + ring and center_y - ring < y < center_y + ring:
                    continue
                candidates.update(index.get((x, y), []))
        if candidates:
            best = min(point_segment_distance_km(lat, lon, start, end) for start, end in candidates)
            conservative_search_km = max(0, ring - 1) * cell_size * 85
            if ring >= 2 and best <= conservative_search_km:
                return round(best, 1)
    if not candidates:
        return None
    return round(min(point_segment_distance_km(lat, lon, start, end) for start, end in candidates), 1)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--agro", default=r"public\data\agro-suitability.geojson")
    parser.add_argument("--infrastructure", default=r"public\data\region-infrastructure.geojson")
    parser.add_argument("--output", default=r"public\data\agro-suitability.geojson")
    args = parser.parse_args()

    agro = json.loads(Path(args.agro).read_text(encoding="utf-8"))
    infrastructure = json.loads(Path(args.infrastructure).read_text(encoding="utf-8"))
    groups = {
        "power": [item for item in infrastructure["features"] if item["properties"].get("kind") in {"power_line", "substation", "power_source"}],
        "rail": [item for item in infrastructure["features"] if item["properties"].get("kind") == "rail"],
        "water": [item for item in infrastructure["features"] if item["properties"].get("kind") == "water"],
    }
    indexes = {key: build_segment_index(value) for key, value in groups.items()}

    for feature in agro["features"]:
        properties = feature["properties"]
        lat = float(properties["latitude"])
        lon = float(properties["longitude"])
        properties["power_km"] = nearest_indexed(lat, lon, indexes["power"])
        properties["rail_km"] = nearest_indexed(lat, lon, indexes["rail"])
        properties["water_km"] = nearest_indexed(lat, lon, indexes["water"])

    metadata = agro.setdefault("metadata", {})
    metadata["infrastructure"] = {
        "source": infrastructure["metadata"].get("source"),
        "observed_at": infrastructure["metadata"].get("observed_at"),
        "counts": infrastructure["metadata"].get("counts"),
        "method": "Nearest distance to mapped OSM geometry, calculated to line segments.",
        "limitations": "Mapped proximity does not confirm capacity, connection rights, water flow, water rights, or tariffs.",
    }
    output = Path(args.output)
    output.write_text(json.dumps(agro, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({"cells": len(agro["features"]), "groups": {key: len(value) for key, value in groups.items()}}, ensure_ascii=False))


if __name__ == "__main__":
    main()
