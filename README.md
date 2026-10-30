# babyscale

Get readings off a **Greater Goods Smart Baby Scale (BS1711-B)** without the vendor app. A small ESP32
board sits next to the scale, reads each weighing over Bluetooth, and posts it to a simple web
app that keeps a growth chart you can share with family.

- `esphome/`: firmware for the bridge (ESPHome on an M5Stack NanoC6).
- `web/`: the weight-tracking web app (Next.js + Postgres). A hosted copy runs at https://babyscale.vercel.app.
- `PROTOCOL.md`: the scale's BLE protocol, reverse-engineered.
- `ggscale.py`, `scale_cli.py`: read the scale from a laptop (Python + bleak).

> **Status:** working end to end: scale → bridge (Bluetooth) → web app (HTTPS). Tested with one
> scale and one bridge.

Not affiliated with Greater Goods. Use at your own risk; this is a hobby project.

## What you need

| Part | Notes |
| --- | --- |
| Greater Goods Smart Baby Scale, model 0220 (Bluetooth name `BS1711-B`) | Other Lifesense/Transtek "A6" scales may work; untested. |
| [M5Stack NanoC6](https://docs.m5stack.com/en/core/M5NanoC6) (ESP32-C6) | About $8. Any ESP32 with BLE should work if you change the `esp32:` block. |
| USB-C cable and a 5 V USB phone charger | Powers the bridge. Data-capable cable for the first flash. |
| A 2.4 GHz Wi-Fi network | The ESP32 can't use 5 GHz. |

Put the bridge within a few metres of the scale and in reach of Wi-Fi.

## Flash the firmware

You do this once, from a Mac, Linux, or Windows computer.

1. Install ESPHome: `pip install esphome` (Python 3.11+).
2. Get the code: `git clone https://github.com/jacobmr/babyscale && cd babyscale/esphome`
3. Make your secrets file: `cp secrets.example.yaml secrets.yaml`, then set:
   - `ota_password`: any random string (it protects over-the-air updates);
   - `ingest_auth`: `"Bearer <device token>"`, with the token from your baby's page in the web app.
   `secrets.yaml` is gitignored. Self-hosting the app? Change the `url:` in `babyscale-bridge.yaml`.
4. Plug the NanoC6 into the computer with USB-C.
5. Build and flash: `esphome run babyscale-bridge.yaml`. Pick the USB serial port when asked
   (on a Mac it looks like `/dev/cu.usbmodem…`). The first build takes several minutes.
   - If no port shows up: unplug, hold the NanoC6's button, plug back in, release. That puts it in
     download mode.
6. Later updates can go over Wi-Fi: `esphome run babyscale-bridge.yaml --device babyscale-bridge.local`.

## Set up the bridge at home

1. Plug the bridge into a USB charger near the scale.
2. On a phone, join the Wi-Fi network **`babyscale-bridge`** (no password). A setup page opens; if it
   doesn't, browse to `http://192.168.4.1`.
3. Pick your home network, type its password, and save. The bridge reboots onto your network and the
   setup hotspot disappears.
4. Put the baby (or anything over 4 lb) on the scale and hold it steady for about 30 s.
   The bridge finds the scale on its own: it adopts the first `BS1711-B` it hears.

Notes:
- Only one Bluetooth device can talk to the scale at a time. Close the Greater Goods app (or turn off
  the phone's Bluetooth) while the bridge is in use.
- The scale sleeps after about a minute; it wakes on weight or its button, and the bridge reconnects.
- Watch the logs with `esphome logs babyscale-bridge.yaml`.

## The web app

Open https://babyscale.vercel.app, create a baby, and choose a password. That browser stays signed in
(a 400-day cookie). From the baby's page you can:

- add weights by hand (lb + oz or kg);
- see a WHO weight-for-age chart (0–24 months, 3rd–97th percentiles);
- copy a **read-only share link** for family;
- find the **device token** for the bridge under "Scale bridge and settings".

The bridge (or anything else) can post readings:

```
POST /api/ingest
Authorization: Bearer <device token>
{"grams": 3160, "measured_at": 1793278648}
```

Readings from the device within 120 s of each other merge into one entry, so a settling scale makes
one data point.

### Run your own copy

Needs Node 20+, pnpm, and a Postgres database (Neon, Supabase, or local).

```
cd web
pnpm install
export DATABASE_URL=postgres://…   SESSION_SECRET=$(openssl rand -hex 32)
pnpm migrate        # creates the tables; safe to re-run
pnpm build && pnpm start
```

On Vercel: import the repo with root directory `web`, set `DATABASE_URL` and `SESSION_SECRET`, and
run `pnpm migrate` once against the database.

## Read the scale from a laptop

```
python3 -m venv .venv && .venv/bin/pip install bleak
.venv/bin/python scale_cli.py
```

See `PROTOCOL.md` for the packet formats.

## License

MIT. See `LICENSE`.
