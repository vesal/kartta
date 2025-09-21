import requests
# import json

# Suomen alueen bounding box
min_lat = 59.85
max_lat = 67.60
min_lon = 21.43
max_lon = 30.38

rus_corner = (61, 28.5)  # lat, lon

# Overpass QL -kysely
# Haetaan kaikki node-tyyppiset nopeuskamerat bounding boxin sisällä
query = f"""
[out:json][timeout:300];
node["highway"="speed_camera"]({min_lat},{min_lon},{max_lat},{max_lon});
out;
"""

url = "https://overpass-api.de/api/interpreter"
response = requests.post(url, data={"data": query})

if response.status_code == 200:
    data = response.json()
    nodes = data.get("elements", [])
    print(f"Löydetty {len(nodes)} nopeuskameraa.\n")

    cameras = []
    camerascsv = []
    for node in nodes:
        lat = node.get("lat")
        lon = node.get("lon")
        tags = node.get("tags", {})
        maxspeed = tags.get("maxspeed")
        direction = tags.get("direction")
        camera_info = {
          "id": node["id"],
          "lat": lat,
          "lon": lon,
          "maxspeed": maxspeed,
          "direction": direction
        }
        # jos maxspeed alkaa RU tai, jätä se pois
        if maxspeed and (maxspeed.startswith("RU") or maxspeed.startswith("FI:RU")):
            continue
        if not maxspeed:
            maxspeed = ""
        if not direction:
            direction = ""
        if direction == "forward":
            direction = "f"
        elif direction == "backward":
            direction = "b"
        if (lat < rus_corner[0]) and (lon > rus_corner[1]):
            # kamera on lähellä Venäjän rajaa, jätä se pois
            continue
        s = f"{float(lat):.6f};{float(lon):.6f};{maxspeed};{direction}"
        camerascsv.append(s)
        # cameras.append(camera_info)
        # print(node)
        # print(f"ID: {node['id']}, Koordinaatit: ({lat}, {lon}), Maxspeed: {maxspeed}, Direction: {direction}")

    # Tallennetaan JSON-tiedostoksi
    # with open("suomen_nopeuskamerat.json", "w", encoding="utf-8") as f:
    #  json.dump(cameras, f, ensure_ascii=False, indent=2)
    # print("\nTallennettu suomen_nopeuskamerat.json")

    # Tallennetaan CSV-tiedostoksi
    camerascsv.sort()
    with open('camerascsv.txt', 'w', encoding='utf-8') as f:
        f.writelines(f"{s}\n" for s in camerascsv)
    print(f"Tallennettu {len(camerascsv)}\n")
else:
    print("HTTP-virhe:", response.status_code)
    print(response.text)
