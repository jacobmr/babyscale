#!/usr/bin/env python3
"""Try candidate writes on the BS1711-B and log any notification that is not the 3 s heartbeat.

Usage: python probe.py <address> [--round N]
"""

import argparse
import asyncio
import json
import time
from datetime import datetime
from pathlib import Path

from bleak import BleakClient

BASE = "0000{}-0000-1000-8000-00805f9b34fb"
NOTIFY = ["a620", "a621", "a625"]
WRITE = ["a624", "a622", "a623"]
HEARTBEAT = bytes.fromhex("100a00070000000000000064")

ROUNDS = {
    # Round 1: answer or echo the scale's 0x0007 heartbeat.
    1: [
        "100a00070000000000000064",
        "10038007" "00",
        "10038007" "01",
        "10028007",
        "10020007",
    ],
}

LOG_PATH = Path(__file__).with_name(f"probe-log-{int(time.time())}.jsonl")


def log(kind, source, data=b"", note=""):
    hexs = data.hex(" ") if data else ""
    stamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
    print(f"{stamp}  {kind:<7} {source:<5} {hexs}  {note}", flush=True)
    with LOG_PATH.open("a") as f:
        f.write(json.dumps({"t": time.time(), "kind": kind, "source": source, "hex": hexs, "note": note}) + "\n")


async def main(address, rnd):
    novel = []
    async with BleakClient(address, timeout=20) as client:
        log("info", "gatt", note="connected")
        for short in NOTIFY:
            def handler(_c, data, short=short):
                data = bytes(data)
                if data == HEARTBEAT:
                    log("beat", short, data)
                else:
                    novel.append((short, data))
                    log("NEW", short, data, "<-- not the heartbeat")
            await client.start_notify(BASE.format(short), handler)
        await asyncio.sleep(3.5)

        for payload in ROUNDS[rnd]:
            data = bytes.fromhex(payload)
            for short in WRITE:
                ch = client.services.get_characteristic(BASE.format(short))
                response = "write" in ch.properties
                try:
                    await client.write_gatt_char(ch, data, response=response)
                    log("write", short, data)
                except Exception as e:  # noqa: BLE001
                    log("write", short, data, f"failed: {e}")
                await asyncio.sleep(3)

        if novel:
            log("info", "gatt", note="new packets seen; listening 20 s more")
            await asyncio.sleep(20)
    print(f"\n{len(novel)} new packet(s). Log: {LOG_PATH}")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("address")
    p.add_argument("--round", type=int, default=1)
    a = p.parse_args()
    asyncio.run(main(a.address, a.round))
