/*
 * ============================================================
 * VirtualLab-HIL — Web-Configurable ESP32 Firmware
 * ============================================================
 * Features:
 *   1. Web Captive Portal / Web Dashboard (Preferences.h & WebServer)
 *      - Configurable Wi-Fi SSID / Password
 *      - Configurable Backend Host IP, Port, and Device ID
 *      - Captive Portal on AP "VirtualLab-ESP32-Setup" (192.168.4.1)
 *      - Background Web Dashboard on http://<esp32-ip>/ in STA mode
 *   2. Expanded Multi-Port Ingress (Sensors -> Virtual Canvas)
 *      - 6 Analog ADC Channels: A0 (36), A1 (39), A2 (34), A3 (35), A4 (32), A5 (33)
 *      - 5 Digital Inputs: D0 (4), D1 (5), D4 (13), D5 (14), D6 (15)
 *   3. Expanded Multi-Port Egress (Virtual Canvas -> Actuators)
 *      - 2 Hardware DACs: DAC0 (25), DAC1 (26)
 *      - 4 PWM Channels: PWM0 (18), PWM1 (19), PWM2 (21), PWM3 (22)
 *      - 3 Digital Outputs: D2 (2 - Built-in LED), D3 (23), D7 (27)
 *   4. Dual-Core FreeRTOS Architecture (Core 0: Network/Web, Core 1: Hardware I/O)
 * ============================================================
 */

#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

// ─── Hardware Pin Definitions ────────────────────────────────
// Ingress (Sensors -> Virtual Canvas)
const int HW_ADC0 = 36; // VP (ADC1_CH0)
const int HW_ADC1 = 39; // VN (ADC1_CH3)
const int HW_ADC2 = 34; // ADC1_CH6
const int HW_ADC3 = 35; // ADC1_CH7
const int HW_ADC4 = 32; // ADC1_CH4
const int HW_ADC5 = 33; // ADC1_CH5
const int HW_D0   = 4;  // GPIO input
const int HW_D1   = 5;  // GPIO input
const int HW_D4   = 13; // GPIO input
const int HW_D5   = 14; // GPIO input
const int HW_D6   = 15; // GPIO input

// Egress (Virtual Canvas -> Physical Actuators)
const int HW_DAC0 = 25; // DAC1 (GPIO 25)
const int HW_DAC1 = 26; // DAC2 (GPIO 26)
const int HW_PWM0 = 18; // LED / Motor PWM
const int HW_PWM1 = 19;
const int HW_PWM2 = 21;
const int HW_PWM3 = 22;
const int HW_D2   = 2;  // Built-in LED / GPIO output
const int HW_D3   = 23; // GPIO output
const int HW_D7   = 27; // GPIO output

// ─── Configuration & Storage ─────────────────────────────────
Preferences prefs;
WebServer server(80);
DNSServer dnsServer;
WebSocketsClient webSocket;
SemaphoreHandle_t dataMutex;

String cfg_ssid       = "ShuklaG";
String cfg_password   = "@n@nd$hukl@";
String cfg_serverHost = "virtuallabs-hil.onrender.com";
int    cfg_serverPort = 443;
String cfg_deviceId   = "esp32_lab_01";
int    cfg_interval   = 33; // ms (~30 Hz)

bool isAPMode = false;

struct TelemetryInputs {
  float a0, a1, a2, a3, a4, a5;
  int d0, d1, d4, d5, d6;
} latestInputs;

struct ActuatorOutputs {
  float dac0, dac1;
  int pwm0, pwm1, pwm2, pwm3;
  int d2, d3, d7;
} latestOutputs;

// ─── HTML Web Configuration Dashboard ────────────────────────
const char HTML_CONFIG_PAGE[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>VirtualLab-HIL ESP32 Settings</title>
  <style>
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: #0b0f19; color: #e2e8f0; margin: 0; padding: 20px; display: flex; justify-content: center; }
    .card { background: #131b2e; border: 1px solid #1e293b; border-radius: 12px; max-width: 480px; width: 100%; padding: 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    h1 { font-size: 18px; margin-top: 0; color: #f97316; display: flex; align-items: center; gap: 8px; }
    .sub { font-size: 12px; color: #94a3b8; margin-bottom: 20px; }
    label { display: block; font-size: 11px; font-weight: 600; text-transform: uppercase; color: #94a3b8; margin-top: 12px; margin-bottom: 4px; }
    input, select { width: 100%; background: #0b0f19; border: 1px solid #334155; color: #f8fafc; padding: 10px; border-radius: 6px; font-size: 13px; font-family: monospace; outline: none; }
    input:focus { border-color: #f97316; }
    .row { display: flex; gap: 10px; }
    .btn { background: #f97316; color: #0b0f19; border: none; padding: 12px; border-radius: 6px; font-weight: bold; width: 100%; margin-top: 20px; cursor: pointer; font-size: 14px; transition: 0.2s; }
    .btn:hover { background: #ea580c; }
    .btn-reset { background: #ef444420; color: #ef4444; border: 1px solid #ef444450; margin-top: 10px; }
    .btn-reset:hover { background: #ef444440; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; background: #0284c720; color: #38bdf8; border: 1px solid #0284c740; }
  </style>
</head>
<body>
  <div class="card">
    <h1><span>⚡</span> VirtualLab-HIL Node</h1>
    <div class="sub">Hardware-in-the-Loop Web Configuration Portal <span class="badge">v2.0</span></div>
    
    <form method="POST" action="/save">
      <label>Wi-Fi Network Name (SSID)</label>
      <input type="text" name="ssid" value="%SSID%" required>

      <label>Wi-Fi Password</label>
      <input type="password" name="password" value="%PASSWORD%">

      <div class="row">
        <div style="flex: 2;">
          <label>FastAPI Backend Host / IP</label>
          <input type="text" name="host" value="%HOST%" required>
        </div>
        <div style="flex: 1;">
          <label>Port</label>
          <input type="number" name="port" value="%PORT%" required>
        </div>
      </div>

      <label>Device Identifier</label>
      <input type="text" name="device_id" value="%DEVICE_ID%" required>

      <label>Telemetry Stream Rate (ms)</label>
      <input type="number" name="interval" value="%INTERVAL%" min="10" max="500" required>

      <button type="submit" class="btn">💾 Save Settings & Reboot</button>
    </form>

    <form method="POST" action="/reset" onsubmit="return confirm('Factory reset all saved settings?');">
      <button type="submit" class="btn btn-reset">⚠️ Factory Reset</button>
    </form>
  </div>
</body>
</html>
)rawliteral";

// ─── Web Server Routes ───────────────────────────────────────
void handleRoot() {
  String html = FPSTR(HTML_CONFIG_PAGE);
  html.replace("%SSID%", cfg_ssid);
  html.replace("%PASSWORD%", cfg_password);
  html.replace("%HOST%", cfg_serverHost);
  html.replace("%PORT%", String(cfg_serverPort));
  html.replace("%DEVICE_ID%", cfg_deviceId);
  html.replace("%INTERVAL%", String(cfg_interval));
  server.send(200, "text/html", html);
}

void handleSave() {
  if (server.hasArg("ssid")) cfg_ssid = server.arg("ssid");
  if (server.hasArg("password")) cfg_password = server.arg("password");
  if (server.hasArg("host")) cfg_serverHost = server.arg("host");
  if (server.hasArg("port")) cfg_serverPort = server.arg("port").toInt();
  if (server.hasArg("device_id")) cfg_deviceId = server.arg("device_id");
  if (server.hasArg("interval")) cfg_interval = server.arg("interval").toInt();

  prefs.begin("hil_cfg", false);
  prefs.putString("ssid", cfg_ssid);
  prefs.putString("pass", cfg_password);
  prefs.putString("host", cfg_serverHost);
  prefs.putInt("port", cfg_serverPort);
  prefs.putString("dev_id", cfg_deviceId);
  prefs.putInt("interval", cfg_interval);
  prefs.end();

  server.send(200, "text/html", "<html><body style='background:#0b0f19;color:#22c55e;font-family:sans-serif;text-align:center;padding:40px;'><h2>✅ Settings Saved Successfully!</h2><p>Rebooting ESP32 and connecting to Gateway...</p></body></html>");
  delay(1500);
  ESP.restart();
}

void handleReset() {
  prefs.begin("hil_cfg", false);
  prefs.clear();
  prefs.end();
  server.send(200, "text/html", "<html><body style='background:#0b0f19;color:#ef4444;font-family:sans-serif;text-align:center;padding:40px;'><h2>⚠️ Factory Reset Done!</h2><p>Rebooting into setup mode...</p></body></html>");
  delay(1500);
  ESP.restart();
}

// ─── WebSocket Event Handler (Core 0) ────────────────────────
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.println("[WS] Disconnected from Gateway.");
      break;
    case WStype_ERROR:
      Serial.printf("[WS ERROR] SSL / Socket error: %s\n", (payload != NULL) ? (char*)payload : "Handshake/Connection Rejected");
      break;
    case WStype_CONNECTED:
      Serial.println("[WS] Connected to VirtualLab-HIL Gateway! Telemetry streaming active.");
      break;
    case WStype_TEXT:
      {
        StaticJsonDocument<768> doc;
        DeserializationError error = deserializeJson(doc, payload);
        if (error) {
          Serial.printf("[WS RX] JSON parse error: %s\n", error.c_str());
          break;
        }

        if (doc.containsKey("outputs")) {
          JsonObject out = doc["outputs"];
          if (xSemaphoreTake(dataMutex, (TickType_t)10)) {
            // DACs
            if (out.containsKey("DAC0")) latestOutputs.dac0 = out["DAC0"];
            else if (out.containsKey("dac0")) latestOutputs.dac0 = out["dac0"];

            if (out.containsKey("DAC1")) latestOutputs.dac1 = out["DAC1"];
            else if (out.containsKey("dac1")) latestOutputs.dac1 = out["dac1"];

            // PWMs
            if (out.containsKey("PWM0")) latestOutputs.pwm0 = out["PWM0"];
            else if (out.containsKey("pwm0")) latestOutputs.pwm0 = out["pwm0"];

            if (out.containsKey("PWM1")) latestOutputs.pwm1 = out["PWM1"];
            else if (out.containsKey("pwm1")) latestOutputs.pwm1 = out["pwm1"];

            if (out.containsKey("PWM2")) latestOutputs.pwm2 = out["PWM2"];
            else if (out.containsKey("pwm2")) latestOutputs.pwm2 = out["pwm2"];

            if (out.containsKey("PWM3")) latestOutputs.pwm3 = out["PWM3"];
            else if (out.containsKey("pwm3")) latestOutputs.pwm3 = out["pwm3"];

            // Digital Outputs
            if (out.containsKey("D2"))   latestOutputs.d2   = out["D2"];
            else if (out.containsKey("d2"))   latestOutputs.d2   = out["d2"];

            if (out.containsKey("D3"))   latestOutputs.d3   = out["D3"];
            else if (out.containsKey("d3"))   latestOutputs.d3   = out["d3"];

            if (out.containsKey("D7"))   latestOutputs.d7   = out["D7"];
            else if (out.containsKey("d7"))   latestOutputs.d7   = out["d7"];

            xSemaphoreGive(dataMutex);
          }
          Serial.printf("[HIL EGRESS RX] DAC0=%.2fV, DAC1=%.2fV, D2=%d\n",
            latestOutputs.dac0, latestOutputs.dac1, latestOutputs.d2);
        }
      }
      break;
    default:
      break;
  }
}

// ─── Task 1: Wi-Fi, Web Portal & WebSockets Streamer (Core 0) ──
void TaskNetwork(void * pvParameters) {
  // Load configuration from Flash NVS
  prefs.begin("hil_cfg", true);
  cfg_ssid       = prefs.getString("ssid", cfg_ssid);
  cfg_password   = prefs.getString("pass", cfg_password);
  cfg_serverHost = prefs.getString("host", cfg_serverHost);
  cfg_serverPort = prefs.getInt("port", cfg_serverPort);
  cfg_deviceId   = prefs.getString("dev_id", cfg_deviceId);
  cfg_interval   = prefs.getInt("interval", cfg_interval);
  prefs.end();

  // Try connecting to configured Wi-Fi for 8 seconds
  Serial.printf("\n[Network] Connecting to Wi-Fi SSID: %s ...\n", cfg_ssid.c_str());
  WiFi.mode(WIFI_STA);
  WiFi.begin(cfg_ssid.c_str(), cfg_password.c_str());

  unsigned long startAttempt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startAttempt < 8000) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    isAPMode = false;
    Serial.printf("\n[Wi-Fi] Connected! IP Address: %s\n", WiFi.localIP().toString().c_str());
    Serial.printf("[Web UI] Settings Dashboard available at http://%s/\n", WiFi.localIP().toString().c_str());

    // Synchronize system time for TLS/SSL certificate validation
    configTime(0, 0, "pool.ntp.org", "time.google.com");
    Serial.println("[Time] NTP time synchronization initialized.");
  } else {
    // Launch Captive Portal AP Mode
    isAPMode = true;
    Serial.println("\n[Wi-Fi] Connection failed. Launching Access Point Setup Portal...");
    WiFi.mode(WIFI_AP);
    WiFi.softAP("VirtualLab-ESP32-Setup");
    dnsServer.start(53, "*", WiFi.softAPIP());
    Serial.printf("[AP] Connect to SSID 'VirtualLab-ESP32-Setup' -> Open http://%s/\n", WiFi.softAPIP().toString().c_str());
  }

  // Web Server Routes
  server.on("/", handleRoot);
  server.on("/save", HTTP_POST, handleSave);
  server.on("/reset", HTTP_POST, handleReset);
  server.onNotFound(handleRoot); // Captive portal redirect
  server.begin();

  if (!isAPMode) {
    // Sanitize hostname (strip protocol prefix, trailing slashes, and embedded port)
    String cleanHost = cfg_serverHost;
    cleanHost.trim();
    cleanHost.replace("https://", "");
    cleanHost.replace("http://", "");
    cleanHost.replace("wss://", "");
    cleanHost.replace("ws://", "");
    int slashIdx = cleanHost.indexOf('/');
    if (slashIdx != -1) {
      cleanHost = cleanHost.substring(0, slashIdx);
    }
    int colonIdx = cleanHost.indexOf(':');
    if (colonIdx != -1) {
      cfg_serverPort = cleanHost.substring(colonIdx + 1).toInt();
      cleanHost = cleanHost.substring(0, colonIdx);
    }

    // Start WebSocket Client to FastAPI Gateway (SSL on port 443 or *.onrender.com)
    if (cfg_serverPort == 443 || cleanHost.endsWith(".onrender.com")) {
      Serial.printf("[WS] Connecting via WSS (SSL 443) to: %s/ws/esp32\n", cleanHost.c_str());
      // Pass protocol="" to prevent Sec-WebSocket-Protocol mismatch
      webSocket.beginSSL(cleanHost.c_str(), 443, "/ws/esp32", "", "");
      // NOTE: Do NOT include trailing \r\n as WebSocketsClient appends its own NEW_LINE
      String originHeader = "Origin: https://" + cleanHost;
      webSocket.setExtraHeaders(originHeader.c_str());
    } else {
      Serial.printf("[WS] Connecting via Plain WS to: %s:%d/ws/esp32\n", cleanHost.c_str(), cfg_serverPort);
      webSocket.begin(cleanHost.c_str(), cfg_serverPort, "/ws/esp32", "");
      webSocket.setExtraHeaders("Origin: http://localhost");
    }
    webSocket.onEvent(webSocketEvent);
    webSocket.setReconnectInterval(2000);
    webSocket.enableHeartbeat(15000, 4000, 2);
  }

  unsigned long lastSend = 0;

  for (;;) {
    if (isAPMode) {
      dnsServer.processNextRequest();
    }
    server.handleClient();

    if (!isAPMode) {
      webSocket.loop();

      unsigned long now = millis();
      if (webSocket.isConnected() && (now - lastSend >= (unsigned long)cfg_interval)) {
        lastSend = now;

        float a0 = 0, a1 = 0, a2 = 0, a3 = 0, a4 = 0, a5 = 0;
        int d0 = 0, d1 = 0, d4 = 0, d5 = 0, d6 = 0;

        if (xSemaphoreTake(dataMutex, (TickType_t)5)) {
          a0 = latestInputs.a0;
          a1 = latestInputs.a1;
          a2 = latestInputs.a2;
          a3 = latestInputs.a3;
          a4 = latestInputs.a4;
          a5 = latestInputs.a5;

          d0 = latestInputs.d0;
          d1 = latestInputs.d1;
          d4 = latestInputs.d4;
          d5 = latestInputs.d5;
          d6 = latestInputs.d6;
          xSemaphoreGive(dataMutex);
        }

        // Fast, zero-heap-allocation JSON format to protect TLS memory
        char jsonBuf[384];
        int len = snprintf(
          jsonBuf, sizeof(jsonBuf),
          "{\"device_id\":\"%s\",\"timestamp_ms\":%lu,\"inputs\":{\"A0\":%.2f,\"A1\":%.2f,\"A2\":%.2f,\"A3\":%.2f,\"A4\":%.2f,\"A5\":%.2f,\"D0\":%d,\"D1\":%d,\"D4\":%d,\"D5\":%d,\"D6\":%d}}",
          cfg_deviceId.c_str(),
          now,
          a0, a1, a2, a3, a4, a5,
          d0, d1, d4, d5, d6
        );

        if (len > 0 && len < (int)sizeof(jsonBuf)) {
          webSocket.sendTXT((uint8_t*)jsonBuf, len);
        }
      }
    }
    vTaskDelay(pdMS_TO_TICKS(5));
  }
}

// ─── Task 2: Hardware Sampling & Actuation (Core 1) ──────────
void TaskHardware(void * pvParameters) {
  // Digital Input Setup
  pinMode(HW_D0, INPUT_PULLDOWN);
  pinMode(HW_D1, INPUT_PULLDOWN);
  pinMode(HW_D4, INPUT_PULLDOWN);
  pinMode(HW_D5, INPUT_PULLDOWN);
  pinMode(HW_D6, INPUT_PULLDOWN);

  // Digital Output Setup
  pinMode(HW_D2, OUTPUT);
  pinMode(HW_D3, OUTPUT);
  pinMode(HW_D7, OUTPUT);

  for (;;) {
    // 1. Read Analog ADC Inputs (12-bit: 0..4095 -> 0..3.3V)
    float v0 = (analogRead(HW_ADC0) / 4095.0f) * 3.3f;
    float v1 = (analogRead(HW_ADC1) / 4095.0f) * 3.3f;
    float v2 = (analogRead(HW_ADC2) / 4095.0f) * 3.3f;
    float v3 = (analogRead(HW_ADC3) / 4095.0f) * 3.3f;
    float v4 = (analogRead(HW_ADC4) / 4095.0f) * 3.3f;
    float v5 = (analogRead(HW_ADC5) / 4095.0f) * 3.3f;

    // Read Digital Inputs
    int d0 = digitalRead(HW_D0);
    int d1 = digitalRead(HW_D1);
    int d4 = digitalRead(HW_D4);
    int d5 = digitalRead(HW_D5);
    int d6 = digitalRead(HW_D6);

    if (xSemaphoreTake(dataMutex, (TickType_t)5)) {
      latestInputs.a0 = v0;
      latestInputs.a1 = v1;
      latestInputs.a2 = v2;
      latestInputs.a3 = v3;
      latestInputs.a4 = v4;
      latestInputs.a5 = v5;

      latestInputs.d0 = d0;
      latestInputs.d1 = d1;
      latestInputs.d4 = d4;
      latestInputs.d5 = d5;
      latestInputs.d6 = d6;

      // 2. Actuate Hardware Outputs
      // 8-bit DACs (0..3.3V -> 0..255)
      int dacVal0 = constrain((int)((latestOutputs.dac0 / 3.3f) * 255.0f), 0, 255);
      int dacVal1 = constrain((int)((latestOutputs.dac1 / 3.3f) * 255.0f), 0, 255);
      dacWrite(HW_DAC0, dacVal0);
      dacWrite(HW_DAC1, dacVal1);

      // Digital GPIO Outputs
      digitalWrite(HW_D2, latestOutputs.d2 > 0 ? HIGH : LOW);
      digitalWrite(HW_D3, latestOutputs.d3 > 0 ? HIGH : LOW);
      digitalWrite(HW_D7, latestOutputs.d7 > 0 ? HIGH : LOW);

      xSemaphoreGive(dataMutex);
    }

    vTaskDelay(pdMS_TO_TICKS(10)); // 100 Hz hardware loop
  }
}

// ─── Arduino Setup ───────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  dataMutex = xSemaphoreCreateMutex();

  // Create Core 0 (Network & Web Server) Task with 16KB stack for mbedTLS
  xTaskCreatePinnedToCore(
    TaskNetwork,
    "TaskNetwork",
    16384,
    NULL,
    1,
    NULL,
    0 // Core 0
  );

  // Create Core 1 (Hardware ADC/DAC) Task
  xTaskCreatePinnedToCore(
    TaskHardware,
    "TaskHardware",
    4096,
    NULL,
    2,
    NULL,
    1 // Core 1
  );
}

void loop() {
  // FreeRTOS handles task execution
  vTaskDelete(NULL);
}
