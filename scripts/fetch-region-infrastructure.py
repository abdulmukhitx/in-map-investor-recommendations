"""Fetch a compact Turkistan-region infrastructure overlay from OpenStreetMap.

This public map layer is evidence of mapped infrastructure, not proof of spare
electrical capacity or a guaranteed connection. Site-level capacities continue
to come from the relevant operator or investment-zone source.
"""

from __future__ import annotations

import argparse
import json
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from shapely.geometry import LineString, Point, Polygon, mapping, shape


OVERPASS_ENDPOINTS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
)


def request_overpass(query: str) -> dict:
    body = urllib.parse.urlencode({"data": query}).encode("utf-8")
    last_error: Exception | None = None
    for endpoint in OVERPASS_ENDPOINTS:
        try:
            request = urllib.request.Request(
                endpoint,
                data=body,
                headers={
                    "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                    "User-Agent": "Alpha-Turkistan-Investment-Intelligence/2.0",
                },
            )
            with urllib.request.urlopen(request, timeout=120) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as error:  # pragma: no cover - depends on public service
            last_error = error
    raise RuntimeError(f"All Overpass endpoints failed: {last_error}")


def voltage_kv(tags: dict[str, str]) -> float | None:
    values: list[float] = []
    for item in (tags.get("voltage") or "").replace(",", ";").split(";"):
        try:
            value = float(item.strip())
            values.append(value / 1000 if value > 1000 else value)
        except ValueError:
            continue
    return max(values) if values else None


def element_geometry(element: dict):
    points = [(item["lon"], item["lat"]) for item in element.get("geometry", []) if "lon" in item and "lat" in item]
    if len(points) >= 2:
        if points[0] == points[-1] and len(points) >= 4:
            return Polygon(points)
        return LineString(points)
    center = element.get("center")
    if center:
        return Point(center["lon"], center["lat"])
    if "lat" in element and "lon" in element:
        return Point(element["lon"], element["lat"])
    return None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--boundary",
        default=r"C:\Users\USER\alpha-turkestan\frontend\public\turkestan_boundary.geojson",
    )
    parser.add_argument("--output", default=r"public\data\region-infrastructure.geojson")
    args = parser.parse_args()

    boundary_data = json.loads(Path(args.boundary).read_text(encoding="utf-8"))
    boundary = shape(boundary_data["features"][0]["geometry"])
    west, south, east, north = boundary.bounds
    bbox = f"{south:.6f},{west:.6f},{north:.6f},{east:.6f}"
    query = f"""[out:json][timeout:90];(
      way[\"power\"~\"line|minor_line|cable\"]({bbox});
      nwr[\"power\"~\"substation|plant|generator\"]({bbox});
      way[\"railway\"=\"rail\"]({bbox});
    );out tags center geom;"""
    payload = request_overpass(query)

    features: list[dict] = []
    counts: dict[str, int] = {}
    for element in payload.get("elements", []):
        tags = element.get("tags") or {}
        power = tags.get("power")
        railway = tags.get("railway")
        if power in {"line", "minor_line", "cable"}:
            kind = "power_line"
        elif power == "substation":
            kind = "substation"
        elif power in {"plant", "generator"}:
            kind = "power_source"
        elif railway == "rail":
            kind = "rail"
        else:
            continue

        geometry = element_geometry(element)
        if geometry is None or geometry.is_empty:
            continue
        if kind in {"power_line", "rail"}:
            geometry = geometry.intersection(boundary)
            if geometry.is_empty:
                continue
        elif not boundary.intersects(geometry):
            continue

        kv = voltage_kv(tags)
        label = (
            tags.get("name")
            or tags.get("name:en")
            or tags.get("operator")
            or ({
                "power_line": "Mapped power line",
                "substation": "Mapped substation",
                "power_source": "Mapped power source",
                "rail": "Rail line",
            })[kind]
        )
        counts[kind] = counts.get(kind, 0) + 1
        features.append(
            {
                "type": "Feature",
                "id": f"{element['type']}-{element['id']}",
                "properties": {
                    "kind": kind,
                    "name": label,
                    "voltage_kv": kv,
                    "operator": tags.get("operator"),
                    "detail": tags.get("substation") or tags.get("plant:source") or tags.get("cables") or railway or power,
                    "osm_url": f"https://www.openstreetmap.org/{element['type']}/{element['id']}",
                },
                "geometry": mapping(geometry.simplify(0.00015, preserve_topology=True)),
            }
        )

    output = {
        "type": "FeatureCollection",
        "metadata": {
            "source": "OpenStreetMap via Overpass API",
            "attribution": "© OpenStreetMap contributors",
            "observed_at": payload.get("osm3s", {}).get("timestamp_osm_base") or datetime.now(timezone.utc).isoformat(),
            "counts": counts,
            "disclaimer": "Mapped line or substation evidence does not confirm spare capacity, connection rights or tariffs.",
        },
        "features": features,
    }
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({"features": len(features), "counts": counts, "bytes": output_path.stat().st_size}, ensure_ascii=False))


if __name__ == "__main__":
    main()
