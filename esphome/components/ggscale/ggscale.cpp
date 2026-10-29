#include "ggscale.h"

#ifdef USE_ESP32

#include "esphome/core/application.h"
#include "esphome/core/hal.h"
#include "esphome/core/helpers.h"
#include "esphome/core/log.h"

#include <ctime>

namespace esphome::ggscale {

static const char *const TAG = "ggscale";

static const uint16_t SERVICE = 0xA602;
static const uint16_t CHR_INDICATE_DATA = 0xA620;
static const uint16_t CHR_NOTIFY_DATA = 0xA621;
static const uint16_t CHR_WRITE_ACK = 0xA622;
static const uint16_t CHR_WRITE_COMMAND = 0xA624;
static const uint16_t CHR_NOTIFY_ACK = 0xA625;

static const uint16_t CMD_LOGIN_REQUEST = 0x0007;
static const uint16_t CMD_LOGIN_RESPONSE = 0x0008;
static const uint16_t CMD_INIT_REQUEST = 0x0009;
static const uint16_t CMD_INIT_RESPONSE = 0x000A;
static const uint16_t CMD_COMMAND_RESULT = 0x1000;  // reply to a 0x10xx setting command; inner cmd at bytes 4-5
static const uint16_t CMD_SET_TIME = 0x1002;
static const uint16_t CMD_UNIT_REPORT = 0x2004;
static const uint16_t CMD_LIVE_SUBSCRIBE = 0x4801;
static const uint16_t CMD_MEASUREMENT = 0x4802;

static const uint8_t ACK_OK[] = {0x00, 0x01, 0x01};
// UTC offset in minutes / 15 + 48. 0x20 (UTC-4) is what the app and ggscale.py sent; unverified whether it matters.
static const uint8_t TIMEZONE_FLAG = 0x20;
static const uint32_t ACK_TIMEOUT_MS = 3000;

static const char *unit_name(uint8_t u) {
  switch (u) {
    case 0:
      return "kg";
    case 1:
      return "lb";
    case 2:
      return "lb:oz";
    default:
      return "?";
  }
}

// 0x10, length of what follows, command (BE), payload.
static std::vector<uint8_t> frame(uint16_t cmd, std::initializer_list<uint8_t> payload) {
  std::vector<uint8_t> out{0x10, static_cast<uint8_t>(2 + payload.size()), static_cast<uint8_t>(cmd >> 8),
                           static_cast<uint8_t>(cmd & 0xFF)};
  out.insert(out.end(), payload);
  return out;
}

static uint32_t be32(const uint8_t *p) {
  return (uint32_t(p[0]) << 24) | (uint32_t(p[1]) << 16) | (uint32_t(p[2]) << 8) | p[3];
}

void GGScale::dump_config() {
  ESP_LOGCONFIG(TAG, "Greater Goods baby scale (A6)");
  LOG_SENSOR("  ", "Weight", this->weight_);
  LOG_SENSOR("  ", "Battery", this->battery_);
  LOG_TEXT_SENSOR("  ", "Display unit", this->unit_);
}

uint32_t GGScale::unix_now_() {
  time_t now = ::time(nullptr);
  // No SNTP yet (no Wi-Fi): fall back to the firmware's build time. The bridge timestamps readings itself.
  if (now < 1700000000)
    now = App.get_build_time() + millis() / 1000;
  return static_cast<uint32_t>(now);
}

void GGScale::loop() {
  if (this->awaiting_ack_ && millis() - this->command_sent_at_ > ACK_TIMEOUT_MS) {
    ESP_LOGW(TAG, "No ack on A625 within %u ms, sending next command", (unsigned) ACK_TIMEOUT_MS);
    this->awaiting_ack_ = false;
    this->send_next_command_();
  }
}

void GGScale::write_(uint16_t handle, const uint8_t *data, uint16_t len) {
  char hex[64];
  ESP_LOGD(TAG, "tx %04x %s", handle, format_hex_pretty_to(hex, data, len));
  auto status = esp_ble_gattc_write_char(this->parent()->get_gattc_if(), this->parent()->get_conn_id(), handle, len,
                                         const_cast<uint8_t *>(data), ESP_GATT_WRITE_TYPE_NO_RSP, ESP_GATT_AUTH_REQ_NONE);
  if (status)
    ESP_LOGW(TAG, "esp_ble_gattc_write_char failed, status=%d", status);
}

void GGScale::queue_command_(std::vector<uint8_t> &&cmd) {
  this->commands_.push_back(std::move(cmd));
  if (!this->awaiting_ack_)
    this->send_next_command_();
}

void GGScale::send_next_command_() {
  if (this->commands_.empty())
    return;
  auto cmd = std::move(this->commands_.front());
  this->commands_.pop_front();
  this->awaiting_ack_ = true;
  this->command_sent_at_ = millis();
  this->write_(this->write_command_, cmd.data(), cmd.size());
}

void GGScale::gattc_event_handler(esp_gattc_cb_event_t event, esp_gatt_if_t gattc_if,
                                  esp_ble_gattc_cb_param_t *param) {
  switch (event) {
    case ESP_GATTC_OPEN_EVT:
      if (param->open.status == ESP_GATT_OK)
        ESP_LOGI(TAG, "Connected to scale");
      break;

    case ESP_GATTC_CLOSE_EVT:
      ESP_LOGI(TAG, "Scale disconnected");
      this->commands_.clear();
      this->awaiting_ack_ = false;
      this->notify_data_ = this->indicate_data_ = this->notify_ack_ = 0;
      break;

    case ESP_GATTC_SEARCH_CMPL_EVT: {
      auto *client = this->parent();
      auto handle_of = [client](uint16_t chr) -> uint16_t {
        auto *c = client->get_characteristic(SERVICE, chr);
        return c == nullptr ? 0 : c->handle;
      };
      this->indicate_data_ = handle_of(CHR_INDICATE_DATA);
      this->notify_data_ = handle_of(CHR_NOTIFY_DATA);
      this->write_ack_ = handle_of(CHR_WRITE_ACK);
      this->write_command_ = handle_of(CHR_WRITE_COMMAND);
      this->notify_ack_ = handle_of(CHR_NOTIFY_ACK);
      if (!this->notify_data_ || !this->write_ack_ || !this->write_command_ || !this->notify_ack_) {
        ESP_LOGE(TAG, "Service A602 incomplete: A621=%u A622=%u A624=%u A625=%u", this->notify_data_,
                 this->write_ack_, this->write_command_, this->notify_ack_);
        break;
      }
      // Same order as the app: A625, A621, then A620 (indicate). The scale starts its login beacon on its own.
      this->notify_regs_left_ = 0;
      for (uint16_t h : {this->notify_ack_, this->notify_data_, this->indicate_data_}) {
        if (h == 0)
          continue;
        if (client->register_for_notify(h) == ESP_OK)
          this->notify_regs_left_++;
      }
      break;
    }

    case ESP_GATTC_REG_FOR_NOTIFY_EVT:
      if (param->reg_for_notify.status != ESP_GATT_OK)
        ESP_LOGW(TAG, "Notify registration failed on handle %u", param->reg_for_notify.handle);
      if (this->notify_regs_left_ > 0 && --this->notify_regs_left_ == 0) {
        // Handles are cached above, so the parent may free its GATT cache now.
        this->node_state = espbt::ClientState::ESTABLISHED;
        ESP_LOGI(TAG, "Subscribed; waiting for the scale's login request");
      }
      break;

    case ESP_GATTC_NOTIFY_EVT: {
      const auto &n = param->notify;
      if (n.handle == this->notify_ack_) {
        this->awaiting_ack_ = false;
        this->send_next_command_();
      } else if (n.handle == this->notify_data_ || n.handle == this->indicate_data_) {
        char hex[96];
        ESP_LOGD(TAG, "rx %04x %s", n.handle, format_hex_pretty_to(hex, n.value, n.value_len));
        this->handle_packet_(n.value, n.value_len);
      }
      break;
    }

    default:
      break;
  }
}

void GGScale::handle_packet_(const uint8_t *data, uint16_t len) {
  if (len < 4 || data[0] != 0x10)
    return;
  uint16_t cmd = (data[2] << 8) | data[3];
  this->write_(this->write_ack_, ACK_OK, sizeof(ACK_OK));

  if (cmd == CMD_LOGIN_REQUEST && len >= 12) {
    // 1 = accept, 6-byte key echoed back, 0 = pairing screen off, 2 = fixed trailer.
    ESP_LOGI(TAG, "Login request: user %u, battery %u%%", data[10], data[11]);
    if (this->battery_ != nullptr)
      this->battery_->publish_state(data[11]);
    this->queue_command_(frame(CMD_LOGIN_RESPONSE, {0x01, data[4], data[5], data[6], data[7], data[8], data[9], 0x00,
                                                    0x02}));
  } else if (cmd == CMD_INIT_REQUEST && len >= 5) {
    uint32_t now = this->unix_now_();
    this->queue_command_(frame(CMD_INIT_RESPONSE, {data[4], uint8_t(now >> 24), uint8_t(now >> 16),
                                                   uint8_t(now >> 8), uint8_t(now), TIMEZONE_FLAG}));
    // Set time, little-endian. The app's length byte is 9 although 8 bytes follow; copied as-is.
    auto set_time = frame(CMD_SET_TIME, {0x03, uint8_t(now), uint8_t(now >> 8), uint8_t(now >> 16),
                                         uint8_t(now >> 24), 0x30});
    set_time[1] = 9;
    this->queue_command_(std::move(set_time));
  } else if (cmd == CMD_COMMAND_RESULT && len >= 6 && ((data[4] << 8) | data[5]) == CMD_SET_TIME) {
    ESP_LOGI(TAG, "Set time %s; subscribing to measurements", len >= 7 && data[6] == 1 ? "OK" : "rejected");
    this->queue_command_(frame(CMD_LIVE_SUBSCRIBE, {0x00, 0x01}));
  } else if (cmd == CMD_UNIT_REPORT && len >= 5) {
    if (this->unit_ != nullptr)
      this->unit_->publish_state(unit_name(data[4]));
  } else if (cmd == CMD_MEASUREMENT && len >= 16) {
    // 4-5 index | 6-9 flags | 10-11 grams | 12-15 scale's unix time, all big-endian
    uint16_t index = (data[4] << 8) | data[5];
    uint32_t flags = be32(data + 6);
    uint16_t grams = (data[10] << 8) | data[11];
    ESP_LOGI(TAG, "Weight %u g = %.3f lb (index %u, flags 0x%08" PRIx32 ", screen %s)", grams, grams / 453.59237f, index,
             flags, unit_name(flags & 3));
    if (this->unit_ != nullptr)
      this->unit_->publish_state(unit_name(flags & 3));
    if (index == 0 && this->weight_ != nullptr)
      this->weight_->publish_state(grams);
  }
}

}  // namespace esphome::ggscale

#endif
