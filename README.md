# micro:bit — Control Panel v3.0

> *Ark's Microbit App* — a single-file web dashboard that talks to a BBC micro:bit over **Web Bluetooth (UART)**. Monitor temperature & humidity, control a lamp and fan, drive a robot with a D-pad, and log everything — no app install, no build step, no backend.

The UI is in **Bahasa Indonesia** (Dashboard, Control Pad, Panduan, Pengaturan); this README is in English.

---

## Table of Contents

- [Features](#features)
- [Interface](#interface)
- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [Demo Mode](#demo-mode)
- [Communication Protocol](#communication-protocol)
- [Settings Reference](#settings-reference)
- [Data Persistence & Export](#data-persistence--export)
- [Example micro:bit Program (MicroPython)](#example-microbit-program-micropython)
- [Troubleshooting](#troubleshooting)
- [Tech Stack](#tech-stack)
- [Credits](#credits)

---

## Features

### Live monitoring
- **Sensor cards** for temperature (°C), humidity (%), and current mode, with rolling **Chart.js graphs** (10–100 points per chart, configurable).
- **Session statistics** — min / max / average for temperature and humidity, auto-reset on every new connection or demo run (handy for lab reports).
- **Freshness indicators** — each reading shows its age ("baru saja", "3 dtk lalu"); if no data arrives within a configurable window (default **5 s**, range 2–60 s), the value dims and is flagged **BASI** (stale).

### Output control
- **Lamp toggle** (`lampu:1` / `lampu:0`).
- **Fan slider** `0–1023` with 0/25/50/75/100 % presets — the command is sent **only when the slider is released**, so Bluetooth isn't flooded.
- **Auto-fan mode** — fan speed tracks temperature linearly between two thresholds (off ≤ min °C, max ≥ max °C); touching the manual slider disables it.
- **Control Pad** — hold ▲ ◀ ▶ ▼ to send movement commands, release to send `stop`. Also drivable with **arrow keys / WASD** or a **USB gamepad** (D-pad or left analog stick); gamepad status is shown under the pad.
- **Last command** card — resend, edit & send manually, plus a send **history**.

### Alerts, logging & records
- **Temperature alarm** with configurable threshold, Web Audio beep, volume control, a "test sound" button, and **hysteresis** (silences itself 0.5 °C below the threshold to stop chirping at the edge).
- **Background notifications** — system notification + vibration + flashing tab title when the alarm fires while the tab is hidden.
- **Activity log** with auto-scroll, copy, download, and clear.
- **Session recording** — every sensor data point (temperature, humidity, mode, lamp, fan) is timestamped automatically; last up to **10,000 rows** by default (1,000–50,000 configurable), **exportable as CSV** for Excel / Google Sheets.

### Connection management
- **Auto-reconnect** on unexpected drops (default 12 attempts, backoff 1 s → 30 s; configurable 1–20). Manual disconnect never triggers it.
- **Device name prefix filter** and **custom service UUID** support (characteristics are auto-detected; one-click "reset to standard UART").
- **Keep screen awake** (Wake Lock API) during long monitoring sessions.
- Connection stats: device name, session duration, RX/TX packet counts, and RX rate (pkt/s).

### Hand-gesture control (Teachable Machine)
- New **Gestur** page: paste any Teachable Machine share link (default: `https://teachablemachine.withgoogle.com/models/dLWidtkCQ/`), and the panel streams your webcam through the model using the **official `@teachablemachine/image` runtime** (lazy-loaded from CDN, ~15 MB once) — no install, no server.
- **Accuracy pipeline**: per-frame classification (~12 fps) → confidence threshold (default ≥ 65%) → **streak voting + hold time** (gesture must persist ~150 ms) → **hysteresis** (−6%) + 260 ms release grace → **per-gesture cooldown** (default 900 ms). The big readout always shows the raw top prediction even below threshold, so you can see the model responding; per-class probability bars are EMA-smoothed.
- **Class labels & labels-sync**: read from the model's `metadata.json` and automatically re-synced from first predictions; auto-mapping by name (Up/Down/Left/Right/Stop → arrows/stop), each editable: move ▲▼◀▶, stop, lamp toggle, fan ±15%, or nothing.
- **Results & outputs**: current gesture + confidence shown on-page and in the Activity Log; commands flow through the existing send pipeline (history, TX stats, demo loopback, GATT queue). When not connected, gestures are detected and displayed only — never error-spammed.
- Camera preview can be mirrored (cermin) for natural interaction; the loop pauses its "safety release" on tab blur — if you switch tabs mid-gesture, `stop` is sent automatically.

### Quality of life
- **Demo mode** simulating a full micro:bit — every feature works without hardware.
- **10 themes**: Surya (default, dark), Garuda, Noir, Aurora, Zamrud, Ungu Neon, Senja, Sakura, Hitam Pekat, Terminal Retro — applied pre-paint to avoid theme flash on reload.
- **Export / import settings as JSON** to move configuration between devices, and a full factory reset.

---

## Interface

The app is a small single-page app with four views (sidebar navigation):

| View | Contents |
|---|---|
| **Dashboard** | Connection bar + stats · *Sensor* (temperature, humidity, mode, session stats, alarm, session recording) · *Kontrol* (lamp, fan slider, auto-fan) · *Activity Log* |
| **Control Pad** | D-pad, last command + history, keyboard shortcuts |
| **Gestur** | Webcam + Teachable Machine model: live gesture detection, tuning (confidence / hold / cooldown) and gesture→action mapping |
| **Panduan** (Guide) | Compact quick-start + collapsible sections: features, data-format tables, example MicroPython code, troubleshooting, browser support |
| **Pengaturan** (Settings) | Bluetooth connection, appearance, alarm & notifications, data & recording, backup & reset, about |

---

## Requirements

| Requirement | Detail |
|---|---|
| **Browser** | Chrome, Edge, or Opera on Windows / macOS / Android / ChromeOS. **Firefox and Safari do not support Web Bluetooth** — use Demo Mode there instead. |
| **Secure context** | The page must be served over **HTTPS** or from **localhost** — `file://` won't expose the Bluetooth API. |
| **Hardware** | BBC micro:bit (V2 Bluetooth Smart) flashed with a MicroPython program that enables `bluetooth.UART()` (see [example](#example-microbit-program-micropython)). Keep it within ~2 m and not connected to another device. |
| **Device OS** | Bluetooth switched on; no OS-level pairing needed — connection happens via the browser picker. |

---

## Quick Start

1. **Flash the micro:bit** with a UART-enabled MicroPython program (e.g. via <https://python.microbit.org>).
2. **Serve the page** over HTTPS or localhost, e.g.:
   ```bash
   python3 -m http.server 8000        # then open http://localhost:8000/index.html
   ```
   (Or host the single HTML file on any static HTTPS host such as GitHub Pages.)
3. **Open the page in Chrome/Edge** and click **Hubungkan ke Micro:bit**, then pick the `BBC micro:bit [...]` device in the browser dialog.
4. Once the status shows **Terhubung**, sensor data streams in automatically and all controls go live.

No hardware yet? Hit **Mode Demo** (see below).

---

## Demo Mode

Click **Mode Demo** to simulate a micro:bit without Bluetooth: fake sensor data streams in at ~1 Hz, and every control, chart, alarm, recording, and CSV export behaves as it would with real hardware — useful for teaching, testing, and browsers without Web Bluetooth. A demo banner is shown while active, and starting a demo disconnects any live session.

---

## Communication Protocol

All traffic is **line-based text over BLE UART** (one record per line, terminated by `\n`).

### micro:bit → Web (sensor data)

| Key | Meaning | Example |
|---|---|---|
| `suhu` | Temperature in °C (number) | `suhu:27.5` |
| `kelembaban` | Relative humidity 0–100 % (number) | `kelembaban:63` |
| `mode` | Current mode (integer) | `mode:1` |
| `lampu` | Lamp state echo: 1 = on, 0 = off | `lampu:1` |
| `kipas` | Fan speed echo 0–1023 | `kipas:512` |

### Web → micro:bit (commands)

| Command | Meaning |
|---|---|
| `lampu:1` / `lampu:0` | Turn lamp on / off |
| `kipas:0` … `kipas:1023` | Set fan speed (PWM) |
| `atas` / `bawah` / `kiri` / `kanan` | Move (while D-pad / key / gamepad is held) |
| `stop` | Sent the moment the control is released |

### BLE transport

The panel uses the Nordic UART Service (NUS):

| Item | UUID |
|---|---|
| Service (RX/TX) | `6e400001-b5a3-f393-e0a9-e50e24dcca9e` |
| RX characteristic (write) | `6e400002-b5a3-f393-e0a9-e50e24dcca9e` |
| TX characteristic (notify) | `6e400003-b5a3-f393-e0a9-e50e24dcca9e` |

A custom service UUID can be set in **Pengaturan → Koneksi** (takes effect on the next connection; both characteristics are auto-detected from the device's GATT table).

---

## Settings Reference

Everything lives in **Pengaturan** (Settings); changes are saved automatically.

| Group | Options |
|---|---|
| **Koneksi Bluetooth** | Auto-reconnect on/off · max attempts (1–20) · keep screen awake · device name prefix filter · service UUID (with "reset to standard UART") |
| **Tampilan** | Theme (10 options) · chart data-point count (10–100) · toast duration (2/4/8 s) |
| **Alarm & Notifikasi** | Alarm enable + threshold (−40…85 °C) · alarm beep on/off · connect/disconnect/fail sounds · background notifications + vibration · volume (0–100 %) · test beep |
| **Data & Rekaman** | Stale-data limit (2–60 s) · max recording rows (1,000–50,000) · export CSV · clear recording |
| **Backup & Reset** | Export settings (JSON) · import settings (JSON) · restore factory defaults (clears storage + reloads) |
| **Tentang** | App version, transport, chart library, author |

---

## Data Persistence & Export

- Settings and session state persist in `localStorage` under namespaced keys: `microbitTheme`, `microbitConn`, `microbitAlarm`, `microbitUI`, `microbitData`, `microbitFan`, `microbitAutoReconn`.
- **CSV export**: the session recording (timestamp + temperature / humidity / mode / lamp / fan) downloads as a CSV file for analysis in Excel or Google Sheets.
- **Activity log** can be copied or downloaded as text.
- **Settings** can be exported/imported as JSON to move a configuration to another phone/laptop.
- No data ever leaves the browser except what is sent to the micro:bit over Bluetooth — there is no server component.

---

## Example micro:bit Program (MicroPython)

The exact program bundled in the app's *Panduan* tab (also copyable from the UI with one click):

```python
# micro:bit - MicroPython (cocok dengan panel ini)
# Flash lewat https://python.microbit.org lalu hubungkan dari panel ini
from microbit import *
import bluetooth

ble = bluetooth.BLE()
uart = bluetooth.UART()
buf = ""

def kirim(baris):
    uart.write(baris + "\n")

# Terima perintah dari Web
def tangani(cmd):
    if cmd == "lampu:1":
        pin0.write_digital(1)
        kirim("lampu:1")
        display.show(Image.YES)
    elif cmd == "lampu:0":
        pin0.write_digital(0)
        kirim("lampu:0")
        display.show(Image.NO)
    elif cmd.startswith("kipas:"):
        try:
            v = max(0, min(1023, int(cmd[6:])))
        except ValueError:
            v = 0
        pin1.write_analog(v)
        kirim("kipas:" + str(v))
    elif cmd == "atas":
        display.show(Image.ARROW_N)
    elif cmd == "bawah":
        display.show(Image.ARROW_S)
    elif cmd == "kiri":
        display.show(Image.ARROW_W)
    elif cmd == "kanan":
        display.show(Image.ARROW_E)
    elif cmd == "stop":
        display.clear()

while True:
    if uart.any():
        buf += str(uart.read(), "utf-8")
        while "\n" in buf:
            baris, buf = buf.split("\n", 1)
            if baris.strip():
                tangani(baris.strip())
    # Kirim data sensor ke Web tiap 1 detik
    kirim("suhu:" + str(temperature()))
    # micro:bit tidak punya sensor kelembaban bawaan -
    # ganti dengan sensor eksternal (mis. DHT11)
    kirim("kelembaban:60")
    kirim("mode:1")
    sleep(1000)
```

Wiring assumed: **pin0** → lamp/LED, **pin1** → fan (via MOSFET/motor driver, PWM). The humidity value is a placeholder — replace it with a real sensor reading (e.g. DHT11 on pin2).

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Connect button does nothing / errors | Use a recent Chrome/Edge, load the page over **HTTPS or localhost**, and make sure the device's Bluetooth is on. |
| Device not listed | Move the micro:bit closer (< 2 m), confirm the MicroPython program with `bluetooth.UART()` is flashed, and ensure it isn't connected to another phone/laptop. |
| No data arriving | Every line from the board must be `\n`-terminated and use the exact `key:value` format from the protocol tables. |
| GATT errors / dropouts | Toggle Bluetooth off/on, **forget** the micro:bit in OS settings, reconnect from the panel, and enable **Auto-reconnect**. |
| Firefox / Safari | Web Bluetooth unsupported there — use Chrome/Edge, or open **Mode Demo**. |

---

## Tech Stack

- **Single HTML file** — all CSS and JS are inlined; nothing to build or bundle.
- **Web Bluetooth API** for the GATT/UART connection (no pairing, no drivers, no server).
- **[@teachablemachine/image v0.8](https://github.com/googlecreativelab/teachablemachine-community/tree/master/libraries/image)** (loaded lazily from CDN on the Gestur page) runs the Teachable Machine image model in the browser via bundled TensorFlow.js.
- **[Chart.js v4](https://www.chartjs.org/)** (via jsDelivr CDN) for the live sensor graphs.
- **Web Audio API** for alarm/notification beeps · **Notification + Vibration APIs** for background alerts · **Wake Lock API** to keep the screen on.
- **Google Fonts**: Space Grotesk, Inter, JetBrains Mono.
- Works fully offline apart from the two CDN resources (fonts degrade gracefully; charts need Chart.js).

---

## Credits

**micro:bit Control Panel v3.0** — built by **Ark** for IoT learning (*"Dibuat dengan ♥ untuk pembelajaran IoT"*).

Contact (as listed on the site): `arkangantengbgt20131121@gmail.com` · `085353113900`
