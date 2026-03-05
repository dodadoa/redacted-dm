import { MSG } from '../../shared/messages.js'

export class UI {
  constructor() {
    this.overlay = null
  }

  create() {
    const overlay = document.createElement('div')
    overlay.className = 'drum-machine-overlay'
    overlay.id = 'drum-machine-overlay'

    overlay.innerHTML = `
      <button class="close-button" id="drum-machine-close">×</button>
      <h3>Self-censored<br>Step Sequencer</h3>
      <div class="drum-machine-controls">
        <div class="control-group">
          <label>Output Mode</label>
          <div class="control-row">
            <button class="drum-machine-button redact-mode-btn active" id="mode-browser">Browser</button>
            <button class="drum-machine-button redact-mode-btn" id="mode-remote">Local Remote</button>
          </div>
        </div>
        <div class="control-group osc-group" id="osc-group" style="display:none;">
          <label>OSC Bridge (WebSocket)</label>
          <div class="control-row">
            <input type="text" class="bpm-input osc-input" id="osc-host" value="127.0.0.1" placeholder="IP">
            <span class="osc-colon">:</span>
            <input type="number" class="bpm-input osc-input osc-port" id="osc-port" value="8080" placeholder="Port">
          </div>
          <div class="control-row">
            <button class="drum-machine-button" id="osc-connect-btn">Connect</button>
            <button class="drum-machine-button" id="osc-disconnect-btn" disabled>Disconnect</button>
          </div>
          <div class="status-text" id="osc-status">Not connected</div>
        </div>
        <div class="control-group">
          <label>Area Selection</label>
          <div class="control-row">
            <button class="drum-machine-button" id="select-area-btn">Select Area</button>
            <button class="drum-machine-button" id="clear-areas-btn">Clear All</button>
          </div>
          <div class="status-text area-select-hint" id="area-select-hint" style="display: none;">Drag over the content you want to perform with</div>
          <div class="status-text" id="area-status">No areas selected</div>
        </div>
        <div class="control-group">
          <label>Redact Mode</label>
          <button class="drum-machine-button" id="highlight-toggle-btn">Enable Redact</button>
          <div class="status-text" id="highlight-status">0 phrases redacted</div>
        </div>
        <div class="control-group">
          <label>Redact Type</label>
          <div class="control-row">
            <button class="drum-machine-button redact-mode-btn" id="redact-mode-word" data-mode="word">Word</button>
            <button class="drum-machine-button redact-mode-btn active" id="redact-mode-free" data-mode="free">Free</button>
          </div>
          <div class="status-text" id="redact-mode-status">Free highlight mode</div>
        </div>
        <div class="control-group">
          <label>BPM</label>
          <div class="control-row">
            <input type="number" class="bpm-input" id="bpm-input" value="120" min="20" max="300">
            <button class="drum-machine-button" id="bpm-decrease">-</button>
            <button class="drum-machine-button" id="bpm-increase">+</button>
          </div>
          <div class="control-row" id="speed-row">
            <button class="drum-machine-button speed-btn" data-mult="0.25">¼×</button>
            <button class="drum-machine-button speed-btn" data-mult="0.5">½×</button>
            <button class="drum-machine-button speed-btn active" data-mult="1">1×</button>
            <button class="drum-machine-button speed-btn" data-mult="2">2×</button>
            <button class="drum-machine-button speed-btn" data-mult="3">3×</button>
          </div>
        </div>
        <div class="control-group">
          <label>Playback</label>
          <div class="control-row">
            <button class="drum-machine-button" id="play-btn">Play</button>
            <button class="drum-machine-button" id="stop-btn" disabled>Stop</button>
          </div>
        </div>
        <div class="info-text">
          Instructions:<br>
          1. Click "Select Area" and drag to define the rectangle<br>
          2. Enable "Redact Mode" toggle<br>
          3. Select text/phrases in the area to redact them<br>
          4. Adjust BPM and click Play
        </div>
      </div>
    `

    document.body.appendChild(overlay)
    this.makeDraggable(overlay)
    overlay.style.display = 'none'
    this.overlay = overlay
  }

  makeDraggable(element) {
    let isDragging = false
    let initialX, initialY

    const header = element.querySelector('h3')
    if (!header) return

    header.style.cursor = 'move'
    header.style.userSelect = 'none'

    header.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('close-button')) return
      initialX = e.clientX - element.offsetLeft
      initialY = e.clientY - element.offsetTop
      if (e.target === header || header.contains(e.target)) isDragging = true
    })

    document.addEventListener('mousemove', (e) => {
      if (isDragging) {
        e.preventDefault()
        element.style.left = (e.clientX - initialX) + 'px'
        element.style.top  = (e.clientY - initialY) + 'px'
        element.style.right = 'auto'
      }
    })

    document.addEventListener('mouseup', () => { isDragging = false })
  }

  // Sync overlay controls to match the current DrumMachine state.
  // Called by DrumMachine.broadcastState() so both overlay and side panel
  // always reflect the true state.
  syncToState(state) {
    if (!this.overlay) return

    // BPM
    const bpmInput = document.getElementById('bpm-input')
    if (bpmInput && document.activeElement !== bpmInput) bpmInput.value = state.bpm

    // Speed buttons
    document.querySelectorAll('.speed-btn').forEach(btn => {
      btn.classList.toggle('active', parseFloat(btn.dataset.mult) === state.speed)
    })

    // Output mode
    document.getElementById('mode-browser')?.classList.toggle('active', state.outputMode === 'browser')
    document.getElementById('mode-remote')?.classList.toggle('active', state.outputMode === 'remote')
    const oscGroup = document.getElementById('osc-group')
    if (oscGroup) oscGroup.style.display = state.outputMode === 'remote' ? '' : 'none'

    // OSC
    const oscStatus = document.getElementById('osc-status')
    if (oscStatus) oscStatus.textContent = state.oscStatus || 'Not connected'
    const oscConnectBtn    = document.getElementById('osc-connect-btn')
    const oscDisconnectBtn = document.getElementById('osc-disconnect-btn')
    if (oscConnectBtn)    oscConnectBtn.disabled    = state.oscConnected
    if (oscDisconnectBtn) oscDisconnectBtn.disabled = !state.oscConnected

    // Areas
    const areaStatus = document.getElementById('area-status')
    if (areaStatus) {
      const n = state.areaCount || 0
      areaStatus.textContent = n === 0 ? 'No areas selected' : `${n} area${n !== 1 ? 's' : ''} selected`
    }

    // Redact toggle
    const highlightBtn = document.getElementById('highlight-toggle-btn')
    if (highlightBtn) {
      highlightBtn.textContent = state.highlightEnabled ? 'Disable Redact' : 'Enable Redact'
      highlightBtn.classList.toggle('playing', state.highlightEnabled)
    }
    const highlightStatus = document.getElementById('highlight-status')
    if (highlightStatus) {
      const n = state.highlightCount || 0
      highlightStatus.textContent = `${n} phrase${n !== 1 ? 's' : ''} redacted`
    }

    // Redact type
    const wordBtn = document.getElementById('redact-mode-word')
    const freeBtn = document.getElementById('redact-mode-free')
    const redactModeStatus = document.getElementById('redact-mode-status')
    if (wordBtn) wordBtn.classList.toggle('active', state.redactMode === 'word')
    if (freeBtn) freeBtn.classList.toggle('active', state.redactMode === 'free')
    if (redactModeStatus) {
      redactModeStatus.textContent = state.redactMode === 'word'
        ? 'Word mode — redacts individual words'
        : 'Free mode — redacts any selected text'
    }

    // Playback
    const playBtn = document.getElementById('play-btn')
    const stopBtn = document.getElementById('stop-btn')
    if (playBtn) {
      playBtn.disabled = state.isPlaying
      playBtn.classList.toggle('playing', state.isPlaying)
    }
    if (stopBtn) stopBtn.disabled = !state.isPlaying
  }

  show() {
    if (this.overlay) {
      this.overlay.style.display = 'block'
      chrome.runtime.sendMessage({ type: MSG.STATE, open: true }).catch(() => {})
    }
  }

  hide() {
    if (this.overlay) {
      this.overlay.style.display = 'none'
      chrome.runtime.sendMessage({ type: MSG.STATE, open: false }).catch(() => {})
    }
  }

  isVisible() {
    return this.overlay && this.overlay.style.display !== 'none'
  }

  getOverlay() {
    return this.overlay
  }
}
