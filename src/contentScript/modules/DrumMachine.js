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
    
    // Initialize modules
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
    this.setupEventListeners()
  }

  setupEventListeners() {
    // Close button
    const closeBtn = document.getElementById('drum-machine-close')
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.hideOverlay()
      })
    }

    // Select area button
    const selectAreaBtn = document.getElementById('select-area-btn')
    if (selectAreaBtn) {
      selectAreaBtn.addEventListener('click', () => {
        this.areaSelector.startSelection()
      })
    }

    // Clear areas button
    const clearAreasBtn = document.getElementById('clear-areas-btn')
    if (clearAreasBtn) {
      clearAreasBtn.addEventListener('click', () => {
        this.clearAllAreas()
      })
    }

    // Highlight toggle button
    const highlightToggleBtn = document.getElementById('highlight-toggle-btn')
    if (highlightToggleBtn) {
      highlightToggleBtn.addEventListener('click', () => {
        this.toggleHighlightMode()
      })
    }

    // Redact mode buttons
    const redactModeWordBtn = document.getElementById('redact-mode-word')
    if (redactModeWordBtn) {
      redactModeWordBtn.addEventListener('click', () => {
        this.textHighlighter.setRedactMode('word')
      })
    }

    const redactModeFreeBtn = document.getElementById('redact-mode-free')
    if (redactModeFreeBtn) {
      redactModeFreeBtn.addEventListener('click', () => {
        this.textHighlighter.setRedactMode('free')
      })
    }

    // BPM controls
    const bpmInput = document.getElementById('bpm-input')
    if (bpmInput) {
      bpmInput.addEventListener('input', (e) => {
        const wasPlaying = this.sequencer.getIsPlaying()
        this.sequencer.setBPM(parseInt(e.target.value) || 120)
        if (wasPlaying) {
          this.play()
        }
      })
    }

    const bpmDecreaseBtn = document.getElementById('bpm-decrease')
    if (bpmDecreaseBtn) {
      bpmDecreaseBtn.addEventListener('click', () => {
        const wasPlaying = this.sequencer.getIsPlaying()
        this.sequencer.setBPM(Math.max(60, this.sequencer.getBPM() - 5))
        if (wasPlaying) {
          this.play()
        }
      })
    }

    const bpmIncreaseBtn = document.getElementById('bpm-increase')
    if (bpmIncreaseBtn) {
      bpmIncreaseBtn.addEventListener('click', () => {
        const wasPlaying = this.sequencer.getIsPlaying()
        this.sequencer.setBPM(Math.min(200, this.sequencer.getBPM() + 5))
        if (wasPlaying) {
          this.play()
        }
      })
    }

    // Output mode buttons
    const modeBrowserBtn = document.getElementById('mode-browser')
    const modeRemoteBtn = document.getElementById('mode-remote')
    const oscGroup = document.getElementById('osc-group')

    if (modeBrowserBtn) {
      modeBrowserBtn.addEventListener('click', () => {
        this.audioEngine.setMode('browser')
        modeBrowserBtn.classList.add('active')
        modeRemoteBtn?.classList.remove('active')
        if (oscGroup) oscGroup.style.display = 'none'
      })
    }

    if (modeRemoteBtn) {
      modeRemoteBtn.addEventListener('click', () => {
        this.audioEngine.setMode('remote')
        modeRemoteBtn.classList.add('active')
        modeBrowserBtn?.classList.remove('active')
        if (oscGroup) oscGroup.style.display = ''
      })
    }

    // OSC connect / disconnect
    const oscConnectBtn = document.getElementById('osc-connect-btn')
    const oscDisconnectBtn = document.getElementById('osc-disconnect-btn')
    const oscStatusEl = document.getElementById('osc-status')

    this.audioEngine.setOSCStatusCallback((connected, message) => {
      if (oscStatusEl) oscStatusEl.textContent = message
      if (oscConnectBtn) oscConnectBtn.disabled = connected
      if (oscDisconnectBtn) oscDisconnectBtn.disabled = !connected
    })

    if (oscConnectBtn) {
      oscConnectBtn.addEventListener('click', () => {
        const host = document.getElementById('osc-host')?.value.trim() || '127.0.0.1'
        const port = parseInt(document.getElementById('osc-port')?.value) || 8080
        if (oscStatusEl) oscStatusEl.textContent = `Connecting to ${host}:${port}…`
        this.audioEngine.connectRemote(host, port)
      })
    }

    if (oscDisconnectBtn) {
      oscDisconnectBtn.addEventListener('click', () => {
        this.audioEngine.disconnectRemote()
      })
    }

    // Play/Stop buttons
    const playBtn = document.getElementById('play-btn')
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        this.play()
      })
    }

    const stopBtn = document.getElementById('stop-btn')
    if (stopBtn) {
      stopBtn.addEventListener('click', () => {
        this.stop()
      })
    }

    // Listen for text selection (only when highlight mode is enabled)
    let selectionTimeout = null
    document.addEventListener('mouseup', () => {
      if (this.highlightModeEnabled && !this.areaSelector.isSelecting) {
        // Clear any pending timeout
        if (selectionTimeout) {
          clearTimeout(selectionTimeout)
        }
        // Small delay to ensure selection is complete
        selectionTimeout = setTimeout(() => {
          this.handleTextSelection()
          selectionTimeout = null
        }, 50)
      }
    })
  }

  onAreaSelected(areaData) {
    // Re-extract text elements when area is selected
    this.extractAllTextElements()
  }

  onHighlightChange() {
    // Re-extract text elements when highlights change
    if (this.areaSelector.getSelectedAreas().length > 0) {
      setTimeout(() => {
        this.extractAllTextElements()
      }, 10)
    }
  }

  toggleHighlightMode() {
    this.highlightModeEnabled = !this.highlightModeEnabled
    const btn = document.getElementById('highlight-toggle-btn')
    
    if (this.highlightModeEnabled) {
      if (btn) {
        btn.textContent = 'Disable Redact'
        btn.classList.add('playing')
      }
      if (this.areaSelector.getSelectedAreas().length === 0) {
        alert('Please select at least one area first!')
        this.highlightModeEnabled = false
        if (btn) {
          btn.textContent = 'Enable Redact'
          btn.classList.remove('playing')
        }
        return
      }
    } else {
      if (btn) {
        btn.textContent = 'Enable Redact'
        btn.classList.remove('playing')
      }
    }
  }

  clearAllAreas() {
    this.stop()
    this.textHighlighter.clearHighlights()
    this.areaSelector.clearAll()
    this.textExtractor.allTextElements = []
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
    
    // Re-extract text elements to ensure we have the latest
    this.extractAllTextElements()
    
    const allTextElements = this.textExtractor.getAllTextElements()
    const highlightedWords = this.textHighlighter.getHighlightedWords()
    
    // If sequencer was playing, we need to restart it with new BPM
    if (this.sequencer.getIsPlaying()) {
      this.sequencer.stop()
    }
    
    this.sequencer.play(selectedAreas, allTextElements, highlightedWords)
  }

  stop() {
    this.sequencer.stop()
  }

  toggleOverlay(show) {
    if (show) {
      this.showOverlay()
    } else {
      this.hideOverlay()
    }
  }

  showOverlay() {
    this.ui.show()
  }

  hideOverlay() {
    this.stop()
    this.ui.hide()
  }
}

