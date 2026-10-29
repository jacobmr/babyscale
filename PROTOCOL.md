# Greater Goods Smart Baby Scale (0220, "BS1711-B") BLE protocol

Lifesense/Transtek OEM, Transtek "A6" protocol. Confirmed on device 2026-10-28 with `ggscale.py`
(`docs/captures/run-6.txt`) and with an HCI capture of the official app (`docs/captures/app-capture-2026-10-28.txt`).
Both send identical bytes.

## Advertising

- Name `BS1711-B`, service `A602`. Manufacturer data, company 0x3412: `56 78 01 <MAC 6 bytes>`.
- Sleeps after about 1 min idle. Wakes on its button or on weight.

## GATT (service 0xA602)

| UUID | Direction | Use |
| --- | --- | --- |
| A620 | scale → host, indicate | data (enable; unused so far) |
| A621 | scale → host, notify | data packets |
| A622 | host → scale, write without response | ack of each scale packet: `00 01 01` |
| A624 | host → scale, write without response | commands |
| A625 | scale → host, notify | ack of each host command: `00 01 01` |

The app enables notify on A621 and A625 and indicate on A620, in that order.

## Framing

`10 <len> <cmd u16 BE> <payload>`, where `len` counts the bytes after it. Ack every A621 packet on A622.

## Session (every connection)

| # | Dir | Bytes | Meaning |
| --- | --- | --- | --- |
| 1 | rx | `10 0a 00 07 <key 6> <user> <battery>` | login request, repeats every 3 s until answered; user 0 = none bound |
| 2 | tx | `10 0b 00 08 01 <key 6> 00 02` | login response: accept, echo key, pairing screen off, trailer 02 |
| 3 | rx | `10 03 00 09 18` | init request |
| 4 | tx | `10 08 00 0a 18 <unix u32 BE> <tz>` | init response; tz = UTC offset min / 15 + 48 |
| 5 | tx | `10 09 10 02 03 <unix u32 LE> 30` | set time; length byte is 9 though 8 bytes follow (copied from the app) |
| 6 | rx | `10 05 10 00 10 02 01` | set-time result, 01 = OK |
| 7 | tx | `10 04 48 01 00 01` | subscribe to measurements |

Step 7 without steps 5–6 is acked but yields nothing. Setting the pairing flag to 01 in step 2 makes the
scale stop after login (run-5.txt); the app does not do that for this scale.

## Unsolicited packets

- Unit button: `10 03 20 04 <u>`, u = 0 kg, 1 lb, 2 lb:oz.
- Measurement: `10 0e 48 02 <index u16> <flags u32> <weight u16> <unix u32>`, all BE.
  - weight = grams. Confirmed: 0x07c1 = 1985 g = 4.376 lb, screen 4.38 lb; 0x093e = 2366 g, app 5.2 lb.
  - flags & 3 = screen unit (same codes as above). Seen: 0x00000009 with screen in lb.
  - index 0 = live reading. Nonzero = stored history (not seen yet).
  - Sent once per steady reading, about 4–30 s after it settles.
  - Minimum weight about 3.4 lb: the lowest reading seen was 1540 g (M5, esp-run-1). A 372 g (0.82 lb) can never reported.

## Hardware bridge (task 5)

The weight needs a GATT connection plus the handshake above, not just advertisements, so a passive BLE
listener (Shelly BLU gateway, a scan-only script) cannot read it. Options:

- ESP32 with ESPHome `ble_client` and lambdas, or Arduino NimBLE: answer steps 1–7, parse 0x4802,
  publish over MQTT or to Home Assistant. Stateful but small.
- ESPHome `bluetooth_proxy` (active connections) plus logic on the Home Assistant side, reusing
  `ggscale.py`'s sequence through bleak.

Not tried: whether a Shelly Gen3 script can open GATT connections. As far as I know Shelly scripts
only scan, so verify before relying on it.
