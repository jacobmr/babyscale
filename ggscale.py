"""Read the Greater Goods Smart Baby Scale (model 0220, advertises as "BS1711-B").

The scale is a Lifesense/Transtek OEM that speaks Transtek's "A6" protocol over GATT
service 0xA602. Protocol details were taken from the Greater Goods Android app
(com.greatergoods.smartbaby 1.3.3, class GGBathScaleA6) and are documented in PROTOCOL.md.
"""

import asyncio
import struct
import time
from dataclasses import dataclass
from datetime import datetime, timezone

from bleak import BleakClient, BleakScanner

DEVICE_NAME = "BS1711-B"


def _uuid(short):
    return f"0000{short}-0000-1000-8000-00805f9b34fb"


SERVICE = _uuid("a602")
INDICATE_DATA = _uuid("a620")   # scale -> app, indicate
NOTIFY_DATA = _uuid("a621")     # scale -> app, notify
WRITE_ACK = _uuid("a622")       # app -> scale, ack of each scale packet
WRITE_COMMAND = _uuid("a624")   # app -> scale, commands
NOTIFY_ACK = _uuid("a625")      # scale -> app, ack of each app command
BATTERY = _uuid("a640")
FEATURES = _uuid("a641")

CMD_LOGIN_REQUEST = 0x0007
CMD_LOGIN_RESPONSE = 0x0008
CMD_INIT_REQUEST = 0x0009
CMD_INIT_RESPONSE = 0x000A
CMD_COMMAND_RESULT = 0x1000   # scale's reply to a 0x10xx setting command; inner cmd at bytes 4-5
CMD_SET_TIME = 0x1002
CMD_UNIT_REPORT = 0x2004
CMD_LIVE_SUBSCRIBE = 0x4801
CMD_MEASUREMENT = 0x4802

ACK_OK = bytes([0x00, 0x01, 0x01])

GRAMS_PER_LB = 453.59237
GRAMS_PER_OZ = GRAMS_PER_LB / 16
UNIT_NAMES = {0: "kg", 1: "lb", 2: "lb:oz"}


@dataclass
class Reading:
    grams: float
    display_unit: str      # unit the scale's screen is set to
    index: int             # 0 = live/latest; >0 = stored history record
    flags: int             # raw 32-bit flags word
    scale_time: datetime   # timestamp the scale attached
    received: datetime

    @property
    def kg(self):
        return self.grams / 1000

    @property
    def lb(self):
        return self.grams / GRAMS_PER_LB

    @property
    def oz(self):
        return self.grams / GRAMS_PER_OZ

    @property
    def lb_oz(self):
        whole = int(self.lb)
        return whole, (self.grams - whole * GRAMS_PER_LB) / GRAMS_PER_OZ

    def __str__(self):
        lb, oz = self.lb_oz
        return (f"{self.grams:.0f} g | {self.oz:.2f} oz | {self.lb:.3f} lb ({lb} lb {oz:.1f} oz)"
                f" | screen {self.display_unit} | idx {self.index} | flags 0x{self.flags:08x}")


def frame(cmd, payload=b""):
    """Build a single-frame A6 packet: 0x10, length of what follows, command, payload."""
    body = struct.pack(">H", cmd) + payload
    return bytes([0x10, len(body)]) + body


def timezone_flag():
    offset = datetime.now().astimezone().utcoffset()
    return int(offset.total_seconds() // 60) // 15 + 48


def parse_measurement(data):
    """Parse a 0x4802 packet. Layout (big-endian):
    0 0x10 | 1 len | 2-3 cmd | 4-5 index | 6-9 flags | 10-11 weight g | 12-15 unix time | [16-17 impedance]
    """
    _, _, _, index, flags, raw, ts = struct.unpack_from(">BBHHIHI", data)
    return Reading(
        grams=float(raw),
        display_unit=UNIT_NAMES.get(flags & 3, "?"),
        index=index,
        flags=flags,
        scale_time=datetime.fromtimestamp(ts, timezone.utc),
        received=datetime.now(timezone.utc),
    )


async def find_scale(timeout=20.0):
    """Scan until the scale advertises. Press its button or put weight on it to wake it."""
    return await BleakScanner.find_device_by_name(DEVICE_NAME, timeout=timeout)


class BabyScale:
    """Connect, run the A6 login handshake, and hand each reading to a callback.

    on_reading(Reading) is called for every measurement packet.
    on_raw(direction, uuid_short, bytes) is optional, for protocol debugging.
    """

    def __init__(self, device, on_reading, on_raw=None, live=True):
        self.device = device
        self.on_reading = on_reading
        self.on_raw = on_raw or (lambda *a: None)
        self.live = live
        self.user = None
        self.client = None
        self.battery = None
        self.display_unit = None
        self.logged_in = asyncio.Event()
        self._queue = asyncio.Queue()
        self._acked = asyncio.Event()

    async def __aenter__(self):
        self.client = BleakClient(self.device, timeout=20)
        await self.client.connect()
        await self.client.start_notify(NOTIFY_ACK, self._on_ack)
        await self.client.start_notify(NOTIFY_DATA, self._on_data)
        await self.client.start_notify(INDICATE_DATA, self._on_data)
        self._worker = asyncio.create_task(self._handle_packets())
        return self

    async def __aexit__(self, *exc):
        self._worker.cancel()
        if self.client.is_connected:
            await self.client.disconnect()

    def _on_ack(self, char, data):
        self.on_raw("ack<", "a625", bytes(data))
        self._acked.set()

    def _on_data(self, char, data):
        data = bytes(data)
        self.on_raw("rx", char.uuid[4:8], data)
        self._queue.put_nowait(data)

    async def _write(self, uuid, data, response=False):
        self.on_raw("tx", uuid[4:8], data)
        await self.client.write_gatt_char(uuid, data, response=response)

    async def _command(self, data, timeout=3.0):
        """Send a command on A624 and wait for the scale's ack on A625."""
        self._acked.clear()
        await self._write(WRITE_COMMAND, data)
        try:
            await asyncio.wait_for(self._acked.wait(), timeout)
        except asyncio.TimeoutError:
            self.on_raw("noack", "a625", data)

    async def _ready(self):
        self.logged_in.set()
        if self.live:
            await self._command(frame(CMD_LIVE_SUBSCRIBE, b"\x00\x01"))

    async def _handle_packets(self):
        while True:
            data = await self._queue.get()
            if len(data) < 4 or data[0] != 0x10:
                continue
            cmd = struct.unpack_from(">H", data, 2)[0]
            await self._write(WRITE_ACK, ACK_OK)
            if cmd == CMD_LOGIN_REQUEST and len(data) >= 12:
                key = data[4:10]
                self.user = data[10]
                self.battery = data[11]
                # 1 = accept, 6-byte key echoed back, 0 = pairing screen off, 2 = fixed trailer.
                # Pairing flag 1 makes the scale go silent after login (run-5.txt); the app sends 0.
                await self._command(frame(CMD_LOGIN_RESPONSE, b"\x01" + key + b"\x00\x02"))
            elif cmd == CMD_INIT_REQUEST and len(data) >= 5:
                payload = bytes([data[4]]) + struct.pack(">I", int(time.time())) + bytes([timezone_flag()])
                await self._command(frame(CMD_INIT_RESPONSE, payload))
                # The app sets the clock next (GGBathScaleA6.setTime) and only subscribes once the
                # scale answers with 0x1000/0x1002. The time is byte-swapped, so little-endian on the wire.
                # The app's length byte here is 9 although 8 bytes follow; copied as-is.
                set_time = bytearray(frame(CMD_SET_TIME, b"\x03" + struct.pack("<I", int(time.time())) + b"\x30"))
                set_time[1] = 9
                await self._command(bytes(set_time))
            elif cmd == CMD_COMMAND_RESULT and len(data) >= 6 and struct.unpack_from(">H", data, 4)[0] == CMD_SET_TIME:
                await self._ready()
            elif cmd == CMD_UNIT_REPORT and len(data) >= 5:
                self.display_unit = UNIT_NAMES.get(data[4], "?")
            elif cmd == CMD_MEASUREMENT and len(data) >= 16:
                self.on_reading(parse_measurement(data))
