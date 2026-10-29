#!/usr/bin/env python3
"""Print live readings from the Greater Goods baby scale.

Usage:
    python scale_cli.py            # wake the scale, then run this
    python scale_cli.py --raw      # also print every packet in hex
    python scale_cli.py --seconds 60
"""

import argparse
import asyncio
from datetime import datetime

from ggscale import BabyScale, find_scale


def stamp():
    return datetime.now().strftime("%H:%M:%S.%f")[:-3]


async def main(args):
    print("Scanning for BS1711-B (press the scale's button or put weight on it)...")
    device = await find_scale(timeout=args.scan)
    if device is None:
        print("Scale not found. Wake it and try again.")
        return 1
    print(f"Found {device.address}. Connecting...")

    def on_raw(direction, uuid, data):
        if args.raw:
            print(f"{stamp()}  {direction:<4} {uuid}  {data.hex(' ')}")

    def on_reading(r):
        print(f"{stamp()}  {r}")

    async with BabyScale(device, on_reading, on_raw, live=not args.no_live) as scale:
        try:
            await asyncio.wait_for(scale.logged_in.wait(), 15)
            print(f"Logged in as user {scale.user}. Battery {scale.battery}%. Readings follow; Ctrl-C to stop.")
        except asyncio.TimeoutError:
            print("No login handshake within 15 s; listening anyway.")
        await asyncio.sleep(args.seconds)
    return 0


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--raw", action="store_true", help="print every packet in hex")
    p.add_argument("--seconds", type=float, default=300, help="how long to listen")
    p.add_argument("--scan", type=float, default=20, help="scan timeout")
    p.add_argument("--no-live", action="store_true", help="skip the live-data subscribe command")
    try:
        raise SystemExit(asyncio.run(main(p.parse_args())))
    except KeyboardInterrupt:
        pass
