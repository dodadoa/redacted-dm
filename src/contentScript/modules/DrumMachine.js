import { MSG, CMD } from '../../shared/messages.js'
import { FontLoader } from './FontLoader.js'
import { CSSInjector } from './CSSInjector.js'
import { AudioEngine } from './AudioEngine.js'
import { AreaSelector } from './AreaSelector.js'
import { TextHighlighter } from './TextHighlighter.js'
import { TextExtractor } from './TextExtractor.js'
import { Sequencer } from './Sequencer.js'
import { UI } from './UI.js'

export class DrumMachine {
  constructor() {
    this.highlightModeEnabled = false
    this._oscStatus = 'Not connected'

    this.ui = new UI()
    this.audioEngine = new AudioEngine()
    this.areaSelector = new AreaSelector((areaData) => {
      this.onAreaSelected(areaData)
    })
    this.textHighlighter = new TextHighlighter(() => {
      this.onHighlightChange()
    })
    this.textExtractor = new TextExtractor()
    this.sequencer = new Sequencer(this.audioEngine)

    this.init()
  }

  init() {
    FontLoader.load()
    CSSInjector.inject()
    this.ui.create()
    this.setupOverlayListeners()
    this.setupPageListeners()

    this.audioEngine.setOSCStatusCallback((connected, message) => {
      this._oscStatus = message
      this.broadcastState()
    })
  }

  // ─── Overlay button listeners ─────────────────────────────────────────────

  setupOverlayListeners() {
    const on = (id, fn) => document.getElementById(id)?.addEventListener('click', fn)

    on('drum-machine-close', () => this.hideOverlay())
    on('select-area-btn',    () => this.areaSelector.startSelection())
    on('clear-areas-btn',    () => this.clearAllAreas())
    on('highlight-toggle-btn', () => this.toggleHighlightMode())
    on('redact-mode-word',   () => { this.textHighlighter.setRedactMode('word');  this.broadcastState() })
    on('redact-mode-free',   () => { this.textHighlighter.setRedactMode('free');  this.broadcastState() })
    on('play-btn',           () => this.play())
    on('stop-btn',           () => this.stop())
    on('bpm-decrease',       () => { this.sequencer.setBPM(this.sequencer.getBPM() - 5); this.broadcastState() })
    on('bpm-increase',       () => { this.sequencer.setBPM(this.sequencer.getBPM() + 5); this.broadcastState() })
    on('mode-browser', () => {
      this.audioEngine.setMode('browser')
      this.areaSelector.setMode('browser')
      this.broadcastState()
    })
    on('mode-remote', () => {
      this.audioEngine.setMode('remote')
      this.areaSelector.setMode('remote')
      this.broadcastState()
    })
    on('osc-connect-btn', () => {
      const host = document.getElementById('osc-host')?.value.trim() || '127.0.0.1'
      const port = parseInt(document.getElementById('osc-port')?.value) || 8080
      this._oscStatus = `Connecting to ${host}:${port}…`
      this.broadcastState()
      this.audioEngine.connectRemote(host, port)
    })
    on('osc-disconnect-btn', () => this.audioEngine.disconnectRemote())

    const bpmInput = document.getElementById('bpm-input')
    if (bpmInput) {
      bpmInput.addEventListener('input', (e) => {
        this.sequencer.setBPM(parseInt(e.target.value) || 120)
        this.broadcastState()
      })
    }

    document.querySelectorAll('.speed-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.sequencer.setSpeedMultiplier(parseFloat(btn.dataset.mult))
        this.broadcastState()
      })
    })
  }

  // ─── Page-level listeners (text selection) ───────────────────────────────

  setupPageListeners() {
    let selectionTimeout = null
    document.addEventListener('mouseup', () => {
      if (this.highlightModeEnabled && !this.areaSelector.isSelecting) {
        if (selectionTimeout) clearTimeout(selectionTimeout)
        selectionTimeout = setTimeout(() => {
          this.handleTextSelection()
          selectionTimeout = null
        }, 50)
      }
    })
  }

  // ─── Command handler (called from content script message listener) ────────

  handleCommand(action, data = {}) {
    switch (action) {
      case CMD.PLAY:
        this.play()
        break
      case CMD.STOP:
        this.stop()
        break
      case CMD.SELECT_AREA:
        this.areaSelector.startSelection()
        break
      case CMD.CLEAR_AREAS:
        this.clearAllAreas()
        break
      case CMD.SET_BPM:
        this.sequencer.setBPM(Number(data.value) || 120)
        this.broadcastState()
        break
      case CMD.SET_SPEED:
        this.sequencer.setSpeedMultiplier(Number(data.value) || 1)
        this.broadcastState()
        break
      case CMD.TOGGLE_REDACT:
        this.toggleHighlightMode()
        break
      case CMD.SET_REDACT_TYPE:
        this.textHighlighter.setRedactMode(data.value)
        this.broadcastState()
        break
      case CMD.SET_OUTPUT_MODE:
        this.audioEngine.setMode(data.value)
        this.areaSelector.setMode(data.value)
        this.broadcastState()
        break
      case CMD.OSC_CONNECT:
        this._oscStatus = `Connecting to ${data.host}:${data.port}…`
        this.broadcastState()
        this.audioEngine.connectRemote(data.host, data.port)
        break
      case CMD.OSC_DISCONNECT:
        this.audioEngine.disconnectRemote()
        break
      default:
        break
    }
  }

  // ─── State ────────────────────────────────────────────────────────────────

  getState() {
    return {
      isPlaying: this.sequencer.getIsPlaying(),
      bpm: this.sequencer.getBPM(),
      speed: this.sequencer.getSpeedMultiplier(),
      outputMode: this.audioEngine.getMode(),
      oscConnected: this.audioEngine.isRemoteConnected(),
      oscStatus: this._oscStatus,
      highlightEnabled: this.highlightModeEnabled,
      areaCount: this.areaSelector.getSelectedAreas().length,
      highlightCount: this.textHighlighter.getHighlightedWords().length,
      redactMode: this.textHighlighter.getRedactMode(),
      overlayOpen: this.ui.isVisible(),
    }
  }

  broadcastState() {
    const state = this.getState()
    this.ui.syncToState(state)
    chrome.runtime.sendMessage({ type: MSG.STATE, state }).catch(() => {})
  }

  // ─── Callbacks from sub-modules ───────────────────────────────────────────

  onAreaSelected(areaData) {
    this.extractAllTextElements()
    this.broadcastState()
  }

  onHighlightChange() {
    if (this.areaSelector.getSelectedAreas().length === 0) return
    setTimeout(() => {
      this.extractAllTextElements()
      if (this.sequencer.getIsPlaying()) {
        const allTextElements = this.textExtractor.getAllTextElements()
        const highlightedWords = this.textHighlighter.getHighlightedWords()
        this.sequencer.scheduleRefresh(allTextElements, highlightedWords)
      }
      this.broadcastState()
    }, 10)
  }

  // ─── Core actions ─────────────────────────────────────────────────────────

  toggleHighlightMode() {
    if (!this.highlightModeEnabled && this.areaSelector.getSelectedAreas().length === 0) {
      alert('Please select at least one area first!')
      return
    }
    this.highlightModeEnabled = !this.highlightModeEnabled
    this.broadcastState()
  }

  clearAllAreas() {
    this.stop()
    this.textHighlighter.clearHighlights()
    this.areaSelector.clearAll()
    this.textExtractor.allTextElements = []
    this.broadcastState()
  }

  extractAllTextElements() {
    const selectedAreas = this.areaSelector.getSelectedAreas()
    const highlightedWords = this.textHighlighter.getHighlightedWords()
    this.textExtractor.extractAllTextElements(selectedAreas, highlightedWords)
  }

  handleTextSelection() {
    const selectedAreas = this.areaSelector.getSelectedAreas()
    if (selectedAreas.length === 0 || !this.highlightModeEnabled) return
    this.textHighlighter.handleTextSelection(selectedAreas)
  }

  play() {
    const selectedAreas = this.areaSelector.getSelectedAreas()
    this.extractAllTextElements()
    const allTextElements = this.textExtractor.getAllTextElements()
    const highlightedWords = this.textHighlighter.getHighlightedWords()
    if (this.sequencer.getIsPlaying()) this.sequencer.stop()
    this.sequencer.play(selectedAreas, allTextElements, highlightedWords)
    this.broadcastState()
  }

  stop() {
    this.sequencer.stop()
    this.broadcastState()
  }

  // ─── Show / hide overlay ──────────────────────────────────────────────────

  showOverlay() {
    this.ui.show()
    this.broadcastState()
  }

  hideOverlay() {
    this.stop()
    this.ui.hide()
  }
}
