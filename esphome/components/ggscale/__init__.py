"""Greater Goods baby scale (BS1711-B): A6 login handshake over ble_client, weight as a sensor."""

import esphome.codegen as cg
from esphome.components import ble_client, sensor, text_sensor
import esphome.config_validation as cv
from esphome.const import (
    CONF_BATTERY_LEVEL,
    CONF_ID,
    CONF_WEIGHT,
    DEVICE_CLASS_BATTERY,
    DEVICE_CLASS_WEIGHT,
    STATE_CLASS_MEASUREMENT,
    UNIT_PERCENT,
)

DEPENDENCIES = ["ble_client"]
AUTO_LOAD = ["sensor", "text_sensor"]

CONF_DISPLAY_UNIT = "display_unit"

ggscale_ns = cg.esphome_ns.namespace("ggscale")
GGScale = ggscale_ns.class_("GGScale", cg.Component, ble_client.BLEClientNode)

CONFIG_SCHEMA = (
    cv.Schema(
        {
            cv.GenerateID(): cv.declare_id(GGScale),
            cv.Optional(CONF_WEIGHT): sensor.sensor_schema(
                unit_of_measurement="g",
                accuracy_decimals=0,
                device_class=DEVICE_CLASS_WEIGHT,
                state_class=STATE_CLASS_MEASUREMENT,
            ),
            cv.Optional(CONF_BATTERY_LEVEL): sensor.sensor_schema(
                unit_of_measurement=UNIT_PERCENT,
                accuracy_decimals=0,
                device_class=DEVICE_CLASS_BATTERY,
                state_class=STATE_CLASS_MEASUREMENT,
            ),
            cv.Optional(CONF_DISPLAY_UNIT): text_sensor.text_sensor_schema(),
        }
    )
    .extend(cv.COMPONENT_SCHEMA)
    .extend(ble_client.BLE_CLIENT_SCHEMA)
)


async def to_code(config):
    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)
    await ble_client.register_ble_node(var, config)
    if conf := config.get(CONF_WEIGHT):
        cg.add(var.set_weight_sensor(await sensor.new_sensor(conf)))
    if conf := config.get(CONF_BATTERY_LEVEL):
        cg.add(var.set_battery_sensor(await sensor.new_sensor(conf)))
    if conf := config.get(CONF_DISPLAY_UNIT):
        cg.add(var.set_unit_sensor(await text_sensor.new_text_sensor(conf)))
