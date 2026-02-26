import { OSCClient } from './OSCClient.js'

export class AudioEngine {
  constructor() {
    this.audioContext = null
    this.drumSounds = {}

    // 'browser' | 'remote'
    this.mode = 'browser'

    this.oscClient = new OSCClient()

    this.init()
  }

  init() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)()
      this.createDrumSounds()
    } catch (e) {
      console.error('Audio context initialization failed:', e)
    }
  }

  // ─── Mode ─────────────────────────────────────────────────────────────────

  setMode(mode) {
    this.mode = mode // 'browser' | 'remote'
  }

  getMode() {
    return this.mode
  }

  // ─── OSC / Remote ─────────────────────────────────────────────────────────

  connectRemote(host, port) {
    this.oscClient.connect(host, port)
  }

  disconnectRemote() {
    this.oscClient.disconnect()
  }

  setOSCStatusCallback(cb) {
    this.oscClient.onStatusChange = cb
  }

  isRemoteConnected() {
    return this.oscClient.connected
  }

  // ─── Playback ─────────────────────────────────────────────────────────────

  /**
   * Called on every sequencer step — sends /redacted-dm/step in remote mode.
   * In browser mode this is a no-op (browser has no concept of a silent tick).
   */
  playStep(areaIndex, stepIndex, isRedacted) {
    if (this.mode === 'remote') {
      this.oscClient.sendStep(areaIndex, stepIndex, isRedacted)
    }
    // browser mode: visual border already handled by Sequencer; no audio for plain steps
  }

  /**
   * Called only when the current step is a redacted phrase.
   * Browser: plays the drum sound assigned to this area's instrument.
   * Remote: sends /redacted-dm/trigger OSC message.
   *
   * @param {number} wordIndex      global redacted-phrase index (used as OSC arg)
   * @param {number} areaIndex      which area this trigger came from
   * @param {string|null} instrument  instrument name, e.g. 'kick', 'snare' (browser mode)
   */
  playDrumSound(wordIndex, areaIndex = 0, instrument = null) {
    if (this.mode === 'remote') {
      this.oscClient.sendTrigger(areaIndex, wordIndex, 1.0)
      return
    }

    // Browser mode — Web Audio API
    if (!this.audioContext) return
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume()
    }

    // Use the area's selected instrument; fall back to index-cycling if not set
    let drumType = instrument && this.drumSounds[instrument] ? instrument : null
    if (!drumType) {
      const drumTypes = Object.keys(this.drumSounds)
      drumType = drumTypes[(wordIndex + areaIndex) % drumTypes.length]
    }

    if (this.drumSounds[drumType]) {
      this.drumSounds[drumType]()
    }
  }

  // ─── Web Audio sounds ─────────────────────────────────────────────────────

  createDrumSounds() {
    const drumTypes = ['kick', 'snare', 'hihat', 'openhat', 'crash']

    drumTypes.forEach((type) => {
      this.drumSounds[type] = () => {
        if (!this.audioContext) return

        const oscillator = this.audioContext.createOscillator()
        const gainNode = this.audioContext.createGain()

        oscillator.connect(gainNode)
        gainNode.connect(this.audioContext.destination)

        const now = this.audioContext.currentTime

        switch (type) {
          case 'kick':
            oscillator.frequency.setValueAtTime(60, now)
            oscillator.frequency.exponentialRampToValueAtTime(30, now + 0.1)
            gainNode.gain.setValueAtTime(1, now)
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3)
            oscillator.type = 'sine'
            break
          case 'snare':
            oscillator.frequency.setValueAtTime(200, now)
            oscillator.frequency.exponentialRampToValueAtTime(50, now + 0.1)
            gainNode.gain.setValueAtTime(0.7, now)
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2)
            oscillator.type = 'triangle'
            break
          case 'hihat':
            oscillator.frequency.setValueAtTime(8000, now)
            oscillator.frequency.exponentialRampToValueAtTime(1000, now + 0.05)
            gainNode.gain.setValueAtTime(0.3, now)
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1)
            oscillator.type = 'square'
            break
          case 'openhat':
            oscillator.frequency.setValueAtTime(10000, now)
            oscillator.frequency.exponentialRampToValueAtTime(2000, now + 0.15)
            gainNode.gain.setValueAtTime(0.4, now)
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2)
            oscillator.type = 'square'
            break
          case 'crash':
            oscillator.frequency.setValueAtTime(12000, now)
            oscillator.frequency.exponentialRampToValueAtTime(3000, now + 0.3)
            gainNode.gain.setValueAtTime(0.5, now)
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.4)
            oscillator.type = 'sawtooth'
            break
        }

        oscillator.start(now)
        oscillator.stop(now + 0.5)
      }
    })
  }
}
