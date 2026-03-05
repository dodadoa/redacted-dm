import { OSCClient } from './OSCClient.js'

export class AudioEngine {
  constructor() {
    this.audioContext = null
    this.drumSounds = {}
    this._reverbImpulse = null

    // 'browser' | 'remote'
    this.mode = 'browser'

    this.oscClient = new OSCClient()

    this.init()
  }

  init() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)()
      this._reverbImpulse = this._createReverbImpulse(1.2, 1.5)
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
   * Called on every sequencer step — sends /redacted-dm/inst{N}/step in remote mode.
   * In browser mode this is a no-op (browser has no concept of a silent tick).
   * @param {string} [oscInst]  instrument for OSC path (inst1, inst2, etc.) when in remote mode
   */
  playStep(areaIndex, stepIndex, isRedacted, oscInst = null) {
    if (this.mode === 'remote') {
      this.oscClient.sendStep(areaIndex, stepIndex, isRedacted, oscInst)
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
      // instrument here is the OSC inst (inst1, inst2, etc.) from the area's remoteInstrument
      this.oscClient.sendTrigger(areaIndex, wordIndex, 1.0, instrument)
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

  _createNoiseBuffer(duration = 0.5) {
    const sampleRate = this.audioContext.sampleRate
    const length = sampleRate * duration
    const buffer = this.audioContext.createBuffer(1, length, sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1)
    }
    return buffer
  }

  _createReverbImpulse(duration = 1.5, decay = 2) {
    const sampleRate = this.audioContext.sampleRate
    const length = Math.floor(sampleRate * duration)
    const buffer = this.audioContext.createBuffer(2, length, sampleRate)
    const left = buffer.getChannelData(0)
    const right = buffer.getChannelData(1)
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate
      const decayEnv = Math.pow(1 - t / duration, decay)
      const sample = (Math.random() * 2 - 1) * decayEnv * 0.5
      left[i] = sample
      right[i] = sample * (0.9 + Math.random() * 0.2)
    }
    return buffer
  }

  createDrumSounds() {
    const drumTypes = ['kick', 'snare', 'hihat', 'openhat', 'laser']

    drumTypes.forEach((type) => {
      this.drumSounds[type] = () => {
        if (!this.audioContext) return

        const oscillator = this.audioContext.createOscillator()
        const gainNode = this.audioContext.createGain()
        const now = this.audioContext.currentTime

        switch (type) {
          case 'kick':
            oscillator.connect(gainNode)
            gainNode.connect(this.audioContext.destination)
            oscillator.frequency.setValueAtTime(60, now)
            oscillator.frequency.exponentialRampToValueAtTime(30, now + 0.1)
            gainNode.gain.setValueAtTime(1, now)
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3)
            oscillator.type = 'sine'
            break
          case 'snare': {
            // Body + noise burst, short decay
            oscillator.connect(gainNode)
            gainNode.connect(this.audioContext.destination)
            oscillator.frequency.setValueAtTime(180, now)
            oscillator.frequency.exponentialRampToValueAtTime(60, now + 0.03)
            gainNode.gain.setValueAtTime(0.4, now)
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.08)
            oscillator.type = 'triangle'
            // Noise layer
            const noiseBuffer = this._createNoiseBuffer(0.12)
            const noise = this.audioContext.createBufferSource()
            noise.buffer = noiseBuffer
            const noiseGain = this.audioContext.createGain()
            const noiseFilter = this.audioContext.createBiquadFilter()
            noiseFilter.type = 'highpass'
            noiseFilter.frequency.value = 800
            noise.connect(noiseFilter)
            noiseFilter.connect(noiseGain)
            noiseGain.connect(this.audioContext.destination)
            noiseGain.gain.setValueAtTime(0.5, now)
            noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.1)
            noise.start(now)
            noise.stop(now + 0.12)
            break
          }
          case 'hihat': {
            // Noise-based, high and crisp (not laser/square)
            const noiseBuffer = this._createNoiseBuffer(0.08)
            const noise = this.audioContext.createBufferSource()
            noise.buffer = noiseBuffer
            const noiseGain = this.audioContext.createGain()
            const noiseFilter = this.audioContext.createBiquadFilter()
            noiseFilter.type = 'highpass'
            noiseFilter.frequency.value = 5000
            noise.connect(noiseFilter)
            noiseFilter.connect(noiseGain)
            noiseGain.connect(this.audioContext.destination)
            noiseGain.gain.setValueAtTime(0.3, now)
            noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.07)
            noise.start(now)
            noise.stop(now + 0.08)
            break
          }
          case 'openhat': {
            // Open hihat: noise-dominant (not laser), longer sizzle, more reverb
            const dryGain = this.audioContext.createGain()
            const reverbConvolver = this.audioContext.createConvolver()
            reverbConvolver.buffer = this._reverbImpulse
            const reverbGain = this.audioContext.createGain()
            reverbGain.gain.value = 0.7
            const dryMix = this.audioContext.createGain()
            dryMix.gain.value = 0.4
            // Longer high noise - main body of open hat
            const noiseBuffer = this._createNoiseBuffer(0.7)
            const noise = this.audioContext.createBufferSource()
            noise.buffer = noiseBuffer
            const noiseGain = this.audioContext.createGain()
            const noiseFilter = this.audioContext.createBiquadFilter()
            noiseFilter.type = 'highpass'
            noiseFilter.frequency.value = 3500
            noise.connect(noiseFilter)
            noiseFilter.connect(noiseGain)
            noiseGain.gain.setValueAtTime(0.35, now)
            noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.65)
            noiseGain.connect(dryGain)
            dryGain.connect(dryMix)
            dryMix.connect(this.audioContext.destination)
            dryGain.connect(reverbConvolver)
            reverbConvolver.connect(reverbGain)
            reverbGain.connect(this.audioContext.destination)
            noise.start(now)
            noise.stop(now + 0.7)
            break
          }
          case 'laser':
            oscillator.connect(gainNode)
            gainNode.connect(this.audioContext.destination)
            oscillator.frequency.setValueAtTime(12000, now)
            oscillator.frequency.exponentialRampToValueAtTime(3000, now + 0.3)
            gainNode.gain.setValueAtTime(0.5, now)
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.4)
            oscillator.type = 'sawtooth'
            break
        }

        if (type !== 'hihat' && type !== 'openhat') {
          oscillator.start(now)
          oscillator.stop(now + 0.5)
        }
      }
    })
  }
}
