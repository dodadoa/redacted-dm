# Self-Censored Step Sequencer

## Chrome Web Store Description

Some pages have been redacted. Some names. Some dates. Some amounts. Black bars where the truth used to be — silence dressed up as law. This extension turns that silence into music.

HOW IT WORKS:

1. Open any webpage. Click the extension and select an area of text.
2. Highlight the words that cannot be said — the censored, the missing, the ones everyone is thinking.
3. Press play. The sequencer steps through your text, word by word, at your chosen BPM. Every redacted word glows and fires a drum sound. The censored becomes the kick. The disappeared becomes the snare.

FEATURES:

- Select any area on any webpage as your stage
- Redact words by clicking or highlighting — they become the beat
- Step sequencer runs through your text at any BPM and speed you set
- Redacted words glow green and fire drum sounds: kick, snare, hi-hat, open hat, laser
- Multiple areas play in parallel, each with its own instrument
- Undo redactions one by one, or clear and start over
- Browser mode: plays sounds directly in the tab, no setup needed
- Remote mode: streams live OSC messages over WebSocket to your local machine — connect to Max/MSP, SuperCollider, TouchDesigner, Ableton, or any software that listens on UDP

# Privacy statement
Self-Censored Step Sequencer does not collect, store, or transmit any user data. All analysis is performed locally in the browser and no information leaves your device.

---

## Running Locally

### 1. Build and load the extension

```shell
pnpm install
pnpm run build
```

Then in Chrome:
1. Go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select the `build/` folder

---

### 2. Run the OSC bridge (for remote mode)

The extension can send OSC messages to any software that listens on UDP — Max/MSP, SuperCollider, TouchDesigner, Ableton, etc. Because browsers cannot send raw UDP, a small local WebSocket bridge forwards the messages.

```shell
cd bridge
pnpm install
node bridge.js
```

By default the bridge listens for the extension on **WebSocket port 8080** and forwards OSC to **UDP 127.0.0.1:57120** (SuperCollider default). Override with env vars:

```shell
# Max/MSP or TouchDesigner
OSC_PORT=9000 node bridge.js

# Custom host and ports
WS_PORT=9999 OSC_HOST=127.0.0.1 OSC_PORT=57120 node bridge.js
```

---

### 3. Connect the extension to the bridge

1. Open the extension overlay on any page
2. Set **Mode → Remote**
3. Enter host `127.0.0.1` and port `8080`
4. Click **Connect**

Once connected, every beat fires two OSC messages:

| Address | Args | When |
|---|---|---|
| `/redacted-dm/inst{N}/step` | `areaIndex, stepIndex, isRedacted` | every step |
| `/redacted-dm/inst{N}/trigger` | `areaIndex, redactedIndex, velocity` | redacted steps only |

`inst1` = area 1, `inst2` = area 2, etc. Map them to whatever instruments you want on the receiving end.

---

## Packing for the Store

```shell
pnpm run build
```

The `build/` folder is ready to submit. See the [Chrome Web Store publish guide](https://developer.chrome.com/webstore/publish).

---

> built with Vite · Vanilla JS · Manifest v3
