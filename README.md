# babyscale

Get readings off a **Greater Goods Smart Baby Scale (BS1711-B)** without the vendor app. A small ESP32
board sits next to the scale, reads each weighing over Bluetooth, and posts it to a web app that keeps
a growth chart you can share with family.

- `esphome/`: firmware for the bridge (ESPHome on an M5Stack NanoC6).
- `web/`: the weight-tracking web app (Next.js + Postgres). A hosted copy runs at https://www.babyscale.org.
- `PROTOCOL.md`: the scale's BLE protocol, reverse-engineered.
- `ggscale.py`, `scale_cli.py`: read the scale from a laptop (Python + bleak).

> **Status:** working end to end: scale → bridge (Bluetooth) → web app (HTTPS) → phone notification.
> The bridge updates its own firmware over the air. Tested with one scale and one bridge.

No server? You don't need one. The published firmware sends readings to the hosted app at https://www.babyscale.org, which
is free to use: flash the bridge, sign in with your email, and add your bridge. To run your own copy
instead, see "Run your own copy" below.

Don't want to flash anything? We'll mail you a bridge that's ready to go for $15, shipped in the US. Use the
"Request a bridge" button at https://www.babyscale.org. Then plug it in, put it on your Wi-Fi, sign in, and
claim it by typing the weight the scale shows.

Not affiliated with Greater Goods. A hobby project, not a medical device.

## What you need

| Part | Notes |
| --- | --- |
| Greater Goods Smart Baby Scale, model 0220 (Bluetooth name `BS1711-B`) | Other Lifesense/Transtek "A6" scales may work; untested. |
| [M5Stack NanoC6](https://shop.m5stack.com/products/m5stack-nanoc6-dev-kit) (ESP32-C6) | About $8. Its RGB LED shows status. Other ESP32 boards with BLE should work if you change the `esp32:` and LED blocks. |
| USB-C cable and a 5 V USB phone charger | Powers the bridge. Data-capable cable for the first flash. |
| A 2.4 GHz Wi-Fi network | The ESP32 can't use 5 GHz. |

Put the bridge within a few metres of the scale and in reach of Wi-Fi.

## Flash the firmware

You do this once, from a Mac, Linux, or Windows computer. No secrets are compiled in.

1. Install ESPHome: `pip install esphome` (Python 3.11+).
2. Get the code: `git clone https://github.com/jacobmr/babyscale && cd babyscale/esphome`
3. Plug the NanoC6 into the computer with USB-C.
4. Build and flash: `esphome run babyscale-bridge.yaml`. Pick the USB serial port when asked
   (on a Mac it looks like `/dev/cu.usbmodem…`). The first build takes several minutes.
   - If no port shows up: unplug, hold the NanoC6's button, plug back in, release. That puts it in
     download mode.

After that, the bridge keeps itself up to date: 2 minutes after boot and every 6 hours it checks
`https://babyscale.vercel.app/firmware/manifest.json` and installs a newer version. Self-hosting? Point
the `update:` `source:` and the `post_weight` `url:` in `babyscale-bridge.yaml` at your own app.

Flashing over Wi-Fi during development: copy `secrets.example.yaml` to `secrets.yaml`, set
`ota_password`, and use `esphome run babyscale-bridge-lan.yaml --device babyscale-bridge.local`
(that build adds a password-protected LAN update port; don't publish it).

## Set up the bridge at home

1. Plug the bridge into a USB charger near the scale.
2. On a phone, join the Wi-Fi network **`babyscale-bridge`** (no password). A setup page opens; if it
   doesn't, browse to `http://192.168.4.1`.
3. Pick your home network, type its password, and save. The bridge reboots onto your network and the
   setup hotspot disappears.
4. Weigh something over 4 lb. The bridge finds the scale on its own (it adopts the first `BS1711-B`
   it hears) and sends the reading as soon as the scale holds it.
5. In the web app, open **Your babies**. Under "Scale bridge", type the weight the scale just showed
   and tap **Add my bridge**. Only someone at the scale knows that number, so nobody else can take
   your bridge. The reading you just made is waiting in the inbox.

The LED: **blue** while connected to the scale, a **green** flash when a reading is saved, a **red**
flash if the upload failed.

Notes:
- Only one Bluetooth device can talk to the scale at a time. Close the Greater Goods app (or turn off
  the phone's Bluetooth) while the bridge is in use.
- The scale sleeps after about a minute; it wakes on weight or its button, and the bridge reconnects.
- Logs: `esphome logs babyscale-bridge.yaml` with the bridge on USB.

## The web app

Sign in at https://www.babyscale.org with your email: you get a one-time link, and that browser stays
signed in (a 400-day cookie, renewed on each visit). Then:

- **Add a baby or pet.** Babies get WHO weight-for-age curves (0–24 months); pets ("no percentile
  curves") get a dated weight chart.
- **Inbox.** Each scale reading lands at the top of "Your babies" with a button per baby or pet. The
  likely one is highlighted: for a baby, the weight projected along its own WHO percentile; for a pet,
  its last weight. One tap saves it. Unsaved readings are archived after 7 days.
- **Notifications.** "Notify me on this device" sends a push for each reading. iPhone: add the site to
  the home screen first (Share → Add to Home Screen) and turn it on from there.
- **Add weights by hand**, or **import a CSV** (the Greater Goods app's export works as-is).
- **Share** a read-only link, or **add people by email** so they can log weights too.

### Ingest API

The bridge posts each reading:

```
POST /api/ingest
{"bridge_id": "<MAC>", "key": "<32 hex>", "grams": 3160, "measured_at": 1793278648, "version": "2.1.1"}
```

The bridge makes its key once, on first boot; the server trusts the first key it sees for that MAC.
Readings within 120 s from the same bridge merge into one.

### Run your own copy

Needs Node 20+, pnpm, and a Postgres database (Neon, Supabase, or local).

```
cd web
pnpm install
export DATABASE_URL=postgres://…
pnpm migrate        # creates the tables; safe to re-run
pnpm build && pnpm start
```

Environment:

| Variable | Use |
| --- | --- |
| `DATABASE_URL` | Postgres. |
| `RESEND_API_KEY`, `MAIL_FROM` | Sign-in emails via [Resend](https://resend.com). Without a key, links print to the server log. |
| `APP_HOSTS` | Comma-separated hosts allowed in emailed links, first one is the default. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Web push. Make a pair with `npx web-push generate-vapid-keys`. |

On Vercel: import the repo with root directory `web`, set the variables, and run `pnpm migrate` once.

## Read the scale from a laptop

```
python3 -m venv .venv && .venv/bin/pip install bleak
.venv/bin/python scale_cli.py
```

See `PROTOCOL.md` for the packet formats.

## License

MIT. See `LICENSE`.
