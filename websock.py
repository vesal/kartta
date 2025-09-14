import asyncio
import websockets
import zlib

async def main():
    uri = "wss://live2.xcontest.org/websock/webclient"
    async with websockets.connect(uri, origin="https://www.xcontest.org") as ws:
        raw = await ws.recv()
        if isinstance(raw, bytes):
            try:
                data = zlib.decompress(raw, -zlib.MAX_WBITS).decode("utf-8")
                print("Decoded:", data)
            except Exception as e:
                print("Decompress error:", e)
                print("Raw bytes:", raw)
        else:
            print("Text:", raw)

asyncio.run(main())            