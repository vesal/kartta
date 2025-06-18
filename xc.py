#!/usr/bin/python3
import sys
import json

def dms_round(coord):
    """Pyöristää koordinaatin sekunnin tarkkuuteen (1/3600°)."""
    return round(coord * 3600) / 3600

def read_input():
    return [line.strip() for line in sys.stdin if line.strip()]

def to_json(lines):
    if len(lines) < 2:
        raise ValueError("Vähintään kaksi riviä tarvitaan.")
 
    turnpoints = []

    # TAKEOFF from first line
    lat_str, lon_str, name, radius_str, *_ = lines[0].split(",")
    lat = dms_round(float(lat_str))
    lon = dms_round(float(lon_str))
    radius = float(radius_str) * 1000

    takeoff_point = {
        "radius": radius,
        "waypoint": {
            "lat": lat,
            "lon": lon,
            "altSmoothed": 154,
            "name": name,
            "description": ""
        },
        "type": "TAKEOFF"
    }
    turnpoints.append(takeoff_point)

    # SSS (Start of Speed Section) from first line again
    lat_str, lon_str, name, radius_str, outer_str, *_ = lines[0].split(",")
    radius = float(radius_str) * 1000
    outer = int(outer_str)
    sss_direction = "EXIT" if outer else "ENTRY"

    sss_point = {
        "radius": radius,
        "waypoint": {
            "lat": lat,
            "lon": lon,
            "altSmoothed": 154,
            "name": name,
            "description": ""
        },
        "type": "SSS"
    }
    turnpoints.append(sss_point)

    # Välikäännöspisteet (ei viimeinen = ESS)
    for line in lines[1:-1]:
        lat_str, lon_str, name, radius_str, outer_str, *_ = line.split(",")
        lat = dms_round(float(lat_str))
        lon = dms_round(float(lon_str))
        radius = float(radius_str) * 1000
        outer = int(outer_str)

        point = {
            "radius": radius,
            "waypoint": {
                "lat": lat,
                "lon": lon,
                "altSmoothed": 154,
                "name": name,
                "description": ""
            },
            "outer": bool(outer)
        }
        turnpoints.append(point)

    # ESS (End of Speed Section) from last line
    lat_str, lon_str, name, radius_str, *_ = lines[-1].split(",")
    lat = dms_round(float(lat_str))
    lon = dms_round(float(lon_str))
    radius = float(radius_str) * 1000

    ess_point = {
        "radius": radius,
        "waypoint": {
            "lat": lat,
            "lon": lon,
            "altSmoothed": 154,
            "name": name,
            "description": ""
        },
        "type": "ESS"
    }
    turnpoints.append(ess_point)

    return {
        "version": 1,
        "taskType": "CLASSIC",
        "turnpoints": turnpoints,
        "sss": {
            "type": "ELAPSED-TIME",
            "direction": sss_direction,
            "timeGates": ["09:00:00Z"]
        },
        "goal": {
            "type": "CYLINDER",
            "deadline": "20:00:00Z"
        },
        "earthModel": "WGS84"
    }

def main():
    lines = read_input()
    result = to_json(lines)
    print(json.dumps(result, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()