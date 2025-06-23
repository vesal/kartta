import sys
import json

MAX_OUTPUT = 250000


def main():
    data = json.load(sys.stdin)
    output_len = 0
    for feature in data.get("features", []):
        if not feature.get("properties", {}).get("active"):
            continue

        name = feature.get("properties", {}).get("name", "UNKNOWN")
        line = f"- {name}\n"
        if output_len + len(line) > MAX_OUTPUT:
            break
        print(line, end="")
        output_len += len(line)
        coords = feature["geometry"]["coordinates"][0]
        for i, (lon, lat) in enumerate(coords):
            label = "start" if i == 0 or i == len(coords) - 1 else f"kp{i}"
            line = f"{lat},{lon},{label},0.0,0,0,0\n"
            if output_len + len(line) > MAX_OUTPUT:
                return
            print(line, end="")
            output_len += len(line)


if __name__ == "__main__":
    main()
