/**
 * OSCClient — sends OSC messages over WebSocket.
 *
 * Browsers cannot send raw UDP, so OSC is tunnelled through WebSocket.
 * The user must run a local bridge server that accepts WebSocket connections
 * and forwards messages as UDP OSC to their target software (DAW, Max/MSP,
 * SuperCollider, TouchDesigner, etc.).
 *
 * A minimal Node.js bridge example:
 *
 *   const WebSocket = require('ws')
 *   const osc = require('osc')
 *   const wss = new WebSocket.Server({ port: 8080 })
 *   const udpPort = new osc.UDPPort({ remoteAddress: '127.0.0.1', remotePort: 57120 })
 *   udpPort.open()
 *   wss.on('connection', ws => {
 *     ws.on('message', data => udpPort.sendRaw(Buffer.from(data)))
 *   })
 */
export class OSCClient {
  constructor() {
    this.ws = null
    this.connected = false
    this.onStatusChange = null // callback(connected, message)
  }

  // ─── Connection ──────────────────────────────────────────────────────────

  connect(host, port) {
    this.disconnect()

    try {
      const url = `ws://${host}:${port}`
      this.ws = new WebSocket(url)
      this.ws.binaryType = 'arraybuffer'

      this.ws.onopen = () => {
        this.connected = true
        this._notify(true, `Connected to ${url}`)
      }

      this.ws.onclose = () => {
        this.connected = false
        this._notify(false, 'Disconnected')
      }

      this.ws.onerror = (e) => {
        this.connected = false
        this._notify(false, `Connection error — is the bridge running at ${url}?`)
      }
    } catch (e) {
      this._notify(false, `Failed to connect: ${e.message}`)
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.onopen = null
      this.ws.onclose = null
      this.ws.onerror = null
      try { this.ws.close() } catch (_) {}
      this.ws = null
    }
    this.connected = false
  }

  // ─── Send ─────────────────────────────────────────────────────────────────

  /**
   * Send a step message — fired on every sequencer tick regardless of redaction.
   * Address: /redacted-dm/step
   * Args:    areaIndex (int32), stepIndex (int32), isRedacted (int32 0|1)
   */
  sendStep(areaIndex, stepIndex, isRedacted) {
    if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return

    const msg = OSCClient.buildMessage('/redacted-dm/step', [
      { type: 'i', value: areaIndex },
      { type: 'i', value: stepIndex },
      { type: 'i', value: isRedacted ? 1 : 0 },
    ])

    this.ws.send(msg)
  }

  /**
   * Send a trigger message — fired only when the current step is a redacted phrase.
   * Address: /redacted-dm/trigger
   * Args:    areaIndex (int32), redactedIndex (int32), velocity (float32 0–1)
   */
  sendTrigger(areaIndex, redactedIndex, velocity = 1.0) {
    if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return

    const msg = OSCClient.buildMessage('/redacted-dm/trigger', [
      { type: 'i', value: areaIndex },
      { type: 'i', value: redactedIndex },
      { type: 'f', value: velocity },
    ])

    this.ws.send(msg)
  }

  // ─── OSC binary encoder ───────────────────────────────────────────────────

  /** Encode a string as null-terminated, padded to 4-byte boundary. */
  static encodeString(str) {
    const len = str.length + 1                     // +1 for null terminator
    const padded = Math.ceil(len / 4) * 4
    const buf = new Uint8Array(padded)
    for (let i = 0; i < str.length; i++) {
      buf[i] = str.charCodeAt(i)
    }
    return buf
  }

  /** Encode a big-endian int32. */
  static encodeInt32(val) {
    const ab = new ArrayBuffer(4)
    new DataView(ab).setInt32(0, val, false)
    return new Uint8Array(ab)
  }

  /** Encode a big-endian float32. */
  static encodeFloat32(val) {
    const ab = new ArrayBuffer(4)
    new DataView(ab).setFloat32(0, val, false)
    return new Uint8Array(ab)
  }

  /**
   * Build a complete OSC message as a Uint8Array.
   * @param {string} address  OSC address pattern, e.g. '/foo/bar'
   * @param {Array<{type:'i'|'f', value:number}>} args
   */
  static buildMessage(address, args = []) {
    const typeTag = ',' + args.map(a => a.type).join('')

    const parts = [
      OSCClient.encodeString(address),
      OSCClient.encodeString(typeTag),
      ...args.map(a =>
        a.type === 'i'
          ? OSCClient.encodeInt32(a.value)
          : OSCClient.encodeFloat32(a.value)
      ),
    ]

    const totalLen = parts.reduce((sum, p) => sum + p.length, 0)
    const result = new Uint8Array(totalLen)
    let offset = 0
    for (const p of parts) {
      result.set(p, offset)
      offset += p.length
    }
    return result
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  _notify(connected, message) {
    if (this.onStatusChange) this.onStatusChange(connected, message)
  }
}

