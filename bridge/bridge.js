/**
 * Redacted Drum Machine — WebSocket → UDP OSC Bridge
 *
 * The Chrome extension cannot send raw UDP, so it connects here over WebSocket
 * and sends pre-encoded binary OSC messages. This script forwards them as UDP
 * to your target software (DAW, Max/MSP, SuperCollider, TouchDesigner, etc.)
 *
 * Usage
 * ─────
 *   cd bridge
 *   npm install        (or: pnpm install)
 *   node bridge.js
 *
 * Configuration (via env vars or edit the constants below)
 * ─────────────────────────────────────────────────────────
 *   WS_PORT   WebSocket port the extension connects to  (default: 8080)
 *   OSC_HOST  UDP target host                           (default: 127.0.0.1)
 *   OSC_PORT  UDP target port                           (default: 57120)
 *
 * Example — SuperCollider default ports:
 *   OSC_PORT=57120 node bridge.js
 *
 * Example — Max/MSP / TouchDesigner:
 *   OSC_PORT=9000 node bridge.js
 *
 * OSC message schema
 * ───────────────────
 *   Address : /redacted-dm/trigger
 *   Args    : areaIndex (int32)  — which selection area (0-based)
 *             redactedIndex (int32) — which redacted phrase in that area
 *             velocity (float32)    — always 1.0 for now
 */

const { createServer } = await import('http')
const { WebSocketServer } = await import('ws')
const { createSocket } = await import('dgram')

// ─── Configuration ────────────────────────────────────────────────────────────

const WS_PORT  = parseInt(process.env.WS_PORT  ?? '8080')
const OSC_HOST = process.env.OSC_HOST ?? '127.0.0.1'
const OSC_PORT = parseInt(process.env.OSC_PORT ?? '57120')

// ─── UDP socket (sends OSC) ───────────────────────────────────────────────────

const udp = createSocket('udp4')

udp.on('error', (err) => {
  console.error('[UDP] error:', err.message)
})

// ─── WebSocket server (receives from the extension) ───────────────────────────

const httpServer = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end(`Redacted DM Bridge — ws://0.0.0.0:${WS_PORT}\nForwarding OSC → udp://${OSC_HOST}:${OSC_PORT}\n`)
})

const wss = new WebSocketServer({ server: httpServer })

wss.on('connection', (ws, req) => {
  const remote = req.socket.remoteAddress
  console.log(`[WS] client connected from ${remote}`)

  ws.on('message', (data, isBinary) => {
    if (!isBinary) {
      console.warn('[WS] received non-binary message — ignoring')
      return
    }

    // data is a Buffer when binaryType is not set (server-side default)
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)

    // Decode and log with distinct labels per message type
    let address = '(unknown)'
    try {
      const { value: addr, nextOffset } = readOSCString(buf, 0)
      address = addr

      if (address === '/redacted-dm/trigger') {
        // Args: areaIndex (i), redactedIndex (i), velocity (f)
        const { nextOffset: o2 } = readOSCString(buf, nextOffset) // skip type tag
        const areaIdx     = buf.readInt32BE(o2)
        const redactIdx   = buf.readInt32BE(o2 + 4)
        const velocity    = buf.readFloatBE(o2 + 8)
        console.log(
          `[TRIGGER] area=${areaIdx}  redacted=${redactIdx}  vel=${velocity.toFixed(2)}`
        )
      } else if (address === '/redacted-dm/step') {
        // Args: areaIndex (i), stepIndex (i), isRedacted (i)
        const { nextOffset: o2 } = readOSCString(buf, nextOffset) // skip type tag
        const areaIdx    = buf.readInt32BE(o2)
        const stepIdx    = buf.readInt32BE(o2 + 4)
        const isRedacted = buf.readInt32BE(o2 + 8)
        console.log(
          `[step]    area=${areaIdx}  step=${stepIdx}  redacted=${isRedacted ? 'yes' : 'no'}`
        )
      } else {
        console.log(`[OSC] ${address} (${buf.length} bytes)`)
      }
    } catch (_) {
      console.log(`[OSC] ${buf.length} raw bytes (decode error)`)
    }

    udp.send(buf, OSC_PORT, OSC_HOST, (err) => {
      if (err) {
        console.error(`[UDP] ✗ ${address} → ${OSC_HOST}:${OSC_PORT}  (${err.message})`)
      } else {
        console.log(`[UDP] ✓ ${address} → ${OSC_HOST}:${OSC_PORT}`)
      }
    })
  })

  ws.on('close', () => {
    console.log(`[WS] client disconnected from ${remote}`)
  })

  ws.on('error', (err) => {
    console.error(`[WS] error from ${remote}:`, err.message)
  })
})

httpServer.listen(WS_PORT, () => {
  console.log('─────────────────────────────────────────────')
  console.log('  Redacted DM — WebSocket → OSC Bridge')
  console.log('─────────────────────────────────────────────')
  console.log(`  WebSocket  : ws://0.0.0.0:${WS_PORT}`)
  console.log(`  OSC target : udp://${OSC_HOST}:${OSC_PORT}`)
  console.log('─────────────────────────────────────────────')
  console.log('  In the extension UI:')
  console.log('    Mode → Local Remote')
  console.log(`    IP: 127.0.0.1   Port: ${WS_PORT}`)
  console.log('    → Connect')
  console.log('─────────────────────────────────────────────')
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Read a null-terminated OSC string from a Buffer at the given offset.
 * Returns { value: string, nextOffset: number }
 */
function readOSCString(buf, offset) {
  let end = offset
  while (end < buf.length && buf[end] !== 0) end++
  const value = buf.toString('ascii', offset, end)
  // Advance past null terminator and padding to 4-byte boundary
  const raw = end - offset + 1
  const nextOffset = offset + Math.ceil(raw / 4) * 4
  return { value, nextOffset }
}

