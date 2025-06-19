#!/usr/bin/python2.6
# -*- coding: utf-8 -*-
import sys
import json

def dms_round(coord):
    """Pyöristää koordinaatin sekunnin tarkkuuteen (1/3600°)."""
    return round(coord * 3600) / 3600

def read_input():
    lines = []
    for line in sys.stdin:
        line = line.strip()
        if line:
            lines.append(line)
    return lines

def to_json(lines):
    if len(lines) < 2:
        raise ValueError("Vähintään kaksi riviä tarvitaan.")

    turnpoints = []

    # TAKEOFF from first line
    parts = lines[0].split(",")
    lat_str, lon_str, name, radius_str = parts[0], parts[1], parts[2], parts[3]
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
    # outer_str oletetaan viidenneksi arvoksi, tarkista input!
    outer_str = parts[4] if len(parts) > 4 else "0"
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
        parts = line.split(",")
        lat_str, lon_str, name, radius_str = parts[0], parts[1], parts[2], parts[3]
        outer_str = parts[4] if len(parts) > 4 else "0"
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
    parts = lines[-1].split(",")
    lat_str, lon_str, name, radius_str = parts[0], parts[1], parts[2], parts[3]
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
    # Muutetaan tulos unicodeksi, jos se ei ole sitä
    output = json.dumps(result, indent=2, ensure_ascii=False)
    if not isinstance(output, unicode):
        output = output.decode('utf-8')
    print output.encode('utf-8')
	
if __name__ == "__main__":
    main()
