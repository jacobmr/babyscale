#!/usr/bin/env python3
"""Sniff a Bluetooth LE scale from a Mac (or Linux/Windows) with bleak.

Setup:
    python3 -m pip install bleak

Usage:
    python3 scale_sniff.py scan                 # every device nearby, 15 s
    python3 scale_sniff.py scan --name BS       # only names starting with BS
    python3 scale_sniff.py adv --name BS1711    # stream advertisements, print only when bytes change
    python3 scale_sniff.py explore <address>    # connect, dump GATT table, read all, subscribe to all

On macOS the <address> is a UUID that the scan prints, not a MAC address.
The first run will ask Terminal for Bluetooth permission.
Every packet is also written to scale-log-<time>.jsonl next to this script.
"""

import argparse
import asyncio
import json
import time
from datetime import datetime
from pathlib import Path

from bleak import BleakClient, BleakScanner

LOG_PATH = Path(__file__).with_name(f"scale-log-{int(time.time())}.jsonl")


def log(kind, source, data=b"", note=""):
    hexs = data.hex(" ") if data else ""
    stamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
    print(f"{stamp}  {kind:<8} {source:<48} {hexs}  {note}")
    with LOG_PATH.open("a") as f:
        f.write(json.dumps({"t": time.time(), "kind": kind, "source": source, "hex": hexs, "note": note}) + "\n")


def name_ok(name, prefix):
    return not prefix or (name or "").lower().startswith(prefix.lower())


async def scan(args):
    seen = {}

    def cb(device, adv):
        if not name_ok(adv.local_name or device.name, args.name):
            return
        seen[device.address] = (adv.local_name or device.name, adv)

    async with BleakScanner(detection_callback=cb):
        await asyncio.sleep(args.seconds)

    for addr, (name, adv) in sorted(seen.items(), key=lambda kv: -kv[1][1].rssi):
        print(f"\n{addr}  name={name!r}  rssi={adv.rssi}")
        if adv.service_uuids:
            print(f"   service uuids: {', '.join(adv.service_uuids)}")
        for company, data in adv.manufacturer_data.items():
            print(f"   manufacturer 0x{company:04x}: {data.hex(' ')}")
        for uuid, data in adv.service_data.items():
            print(f"   service data {uuid}: {data.hex(' ')}")
    print(f"\n{len(seen)} device(s).")


async def adv(args):
    last = {}

    def cb(device, adv):
        if not name_ok(adv.local_name or device.name, args.name):
            return
        tag = f"{adv.local_name or device.name or '?'} {device.address[:8]}"
        for company, data in adv.manufacturer_data.items():
            key = (device.address, "m", company)
            if last.get(key) != data:
                last[key] = data
                log("adv", f"{tag} mfr 0x{company:04x} rssi {adv.rssi}", data)
        for uuid, data in adv.service_data.items():
            key = (device.address, "s", uuid)
            if last.get(key) != data:
                last[key] = data
                log("adv", f"{tag} svc {uuid[4:8]} rssi {adv.rssi}", data)

    print(f"Listening for {args.seconds} s. Put weight on the scale. Ctrl-C to stop.")
    async with BleakScanner(detection_callback=cb):
        await asyncio.sleep(args.seconds)


async def explore(args):
    print(f"Connecting to {args.address} ...")
    async with BleakClient(args.address, timeout=20) as client:
        log("info", "gatt", note=f"connected, mtu {client.mtu_size}")
        notifiers = []
        for service in client.services:
            print(f"\nService {service.uuid}  {service.description}")
            for ch in service.characteristics:
                props = ",".join(ch.properties)
                print(f"   └ {ch.uuid}  {ch.description}  [{props}]  handle {ch.handle}")
                src = f"{service.uuid[4:8]}/{ch.uuid}"
                if "read" in ch.properties:
                    try:
                        log("read", src, bytes(await client.read_gatt_char(ch)))
                    except Exception as e:  # noqa: BLE001
                        log("info", src, note=f"read failed: {e}")
                if "notify" in ch.properties or "indicate" in ch.properties:
                    notifiers.append((src, ch))

        for src, ch in notifiers:
            def handler(_c, data, src=src):
                log("notify", src, bytes(data))
            try:
                await client.start_notify(ch, handler)
                log("info", src, note="subscribed")
            except Exception as e:  # noqa: BLE001
                log("info", src, note=f"subscribe failed: {e}")

        print(f"\nListening {args.seconds} s. Put a known weight on the scale, press HOLD, change units.")
        await asyncio.sleep(args.seconds)
    print(f"\nLog saved to {LOG_PATH}")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("scan")
    s.add_argument("--name", default="")
    s.add_argument("--seconds", type=float, default=15)
    a = sub.add_parser("adv")
    a.add_argument("--name", default="")
    a.add_argument("--seconds", type=float, default=120)
    e = sub.add_parser("explore")
    e.add_argument("address")
    e.add_argument("--seconds", type=float, default=120)
    args = p.parse_args()
    try:
        asyncio.run({"scan": scan, "adv": adv, "explore": explore}[args.cmd](args))
    except KeyboardInterrupt:
        print(f"\nStopped. Log in {LOG_PATH}")


if __name__ == "__main__":
    main()
