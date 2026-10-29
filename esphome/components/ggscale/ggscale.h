#pragma once

#ifdef USE_ESP32

#include "esphome/components/ble_client/ble_client.h"
#include "esphome/components/sensor/sensor.h"
#include "esphome/components/text_sensor/text_sensor.h"
#include "esphome/core/component.h"

#include <deque>
#include <vector>

namespace esphome::ggscale {

namespace espbt = esphome::esp32_ble_tracker;

// Runs the Transtek A6 session the Greater Goods app runs (PROTOCOL.md, "Session"):
// login -> init -> set time -> subscribe, then publishes each 0x4802 measurement.
class GGScale : public Component, public ble_client::BLEClientNode {
 public:
  void setup() override {}
  void loop() override;
  void dump_config() override;
  void gattc_event_handler(esp_gattc_cb_event_t event, esp_gatt_if_t gattc_if,
                           esp_ble_gattc_cb_param_t *param) override;

  void set_weight_sensor(sensor::Sensor *s) { this->weight_ = s; }
  void set_battery_sensor(sensor::Sensor *s) { this->battery_ = s; }
  void set_unit_sensor(text_sensor::TextSensor *s) { this->unit_ = s; }

 protected:
  void handle_packet_(const uint8_t *data, uint16_t len);
  void queue_command_(std::vector<uint8_t> &&cmd);
  void send_next_command_();
  void write_(uint16_t handle, const uint8_t *data, uint16_t len);
  uint32_t unix_now_();

  sensor::Sensor *weight_{nullptr};
  sensor::Sensor *battery_{nullptr};
  text_sensor::TextSensor *unit_{nullptr};

  uint16_t indicate_data_{0};  // A620
  uint16_t notify_data_{0};    // A621
  uint16_t write_ack_{0};      // A622
  uint16_t write_command_{0};  // A624
  uint16_t notify_ack_{0};     // A625
  uint8_t notify_regs_left_{0};

  // Commands go out one at a time; the next waits for the scale's ack on A625 (or a 3 s timeout).
  std::deque<std::vector<uint8_t>> commands_;
  bool awaiting_ack_{false};
  uint32_t command_sent_at_{0};
};

}  // namespace esphome::ggscale

#endif
