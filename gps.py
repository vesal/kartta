import asyncio
from winrt.windows.devices.geolocation import Geolocator, PositionAccuracy

async def get_location():
    # Luodaan Geolocator ja pyydetään korkea tarkkuus
    geolocator = Geolocator()
    geolocator.desired_accuracy = PositionAccuracy.HIGH

    # Haetaan sijainti
    pos = await geolocator.get_geoposition_async()

    coord = pos.coordinate
    print(f"Latitude: {coord.point.position.latitude}")
    print(f"Longitude: {coord.point.position.longitude}")
    print(f"Altitude: {coord.point.position.altitude}")
    print(f"Accuracy (m): {coord.accuracy}")
    print(f"Altitude Accuracy (m): {coord.altitude_accuracy}")
    print(f"Timestamp: {coord.timestamp}")

if __name__ == "__main__":
    asyncio.run(get_location())