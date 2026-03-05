import './index.css'
import { injectContentScript, sendToTab as _sendToTab, sendCommand as _sendCommand } from '../shared/extension.js'
import { loadFonts } from './fontLoader.js'
import { MSG, CMD } from '../shared/messages.js'

document.addEventListener('DOMContentLoaded', () => {
  loadFonts()
  // ─── State ───────────────────────────────────────────────────────────────

  let activeTabId = null
  let dmState = null  // last known DrumMachine state

  // ─── Tab-scoped wrappers around shared helpers ────────────────────────────

  function sendToTab(type, payload = {}) {
    if (!activeTabId) return Promise.resolve({ success: false, error: 'No active tab' })
    return _sendToTab(activeTabId, type, payload)
  }

  async function sendCommand(action, data = {}) {
    if (!activeTabId) return
    const res = await _sendCommand(activeTabId, action, data)
    if (res.state) applyState(res.state)
  }

  // ─── DOM ──────────────────────────────────────────────────────────────────

  const appEl = document.getElementById('app')

  appEl.innerHTML = `
    <header>
      <h1>Self-censored<br>Step Sequencer</h1>
      <p id="tab-url">No active tab</p>
    </header>
    <div class="panel-body" id="panel-body">
      <div class="notice" id="notice">Open a web page to use the sequencer.</div>

      <div id="controls" style="display:none; flex-direction:column; gap:14px;">

        <!-- Output Mode -->
        <div class="section">
          <div class="section-label">Output Mode</div>
          <div class="btn-row">
            <button class="btn btn-full active" id="mode-browser" data-mode="browser">Browser</button>
            <button class="btn btn-full" id="mode-remote" data-mode="remote">Local Remote</button>
          </div>
        </div>

        <!-- OSC -->
        <div class="section osc-group" id="osc-section" style="display:none;">
          <div class="section-label">OSC Bridge (WebSocket)</div>
          <div class="osc-inputs">
            <input type="text" class="osc-input" id="osc-host" value="127.0.0.1" placeholder="IP">
            <span class="osc-colon">:</span>
            <input type="number" class="osc-input osc-port-input" id="osc-port" value="8080" placeholder="Port">
          </div>
          <div class="btn-row">
            <button class="btn btn-full" id="btn-osc-connect">Connect</button>
            <button class="btn btn-full" id="btn-osc-disconnect" disabled>Disconnect</button>
          </div>
          <div class="status-line" id="osc-status">Not connected</div>
        </div>

        <!-- Area Selection -->
        <div class="section">
          <div class="section-label">Area Selection</div>
          <div class="btn-row">
            <button class="btn btn-full" id="btn-select-area">Select Area</button>
            <button class="btn btn-full" id="btn-clear-areas">Clear All</button>
          </div>
          <div class="status-line" id="area-status">0 areas selected</div>
        </div>

        <!-- Redact Mode -->
        <div class="section">
          <div class="section-label">Redact</div>
          <button class="btn" id="btn-toggle-redact">Enable Redact</button>
          <div class="status-line" id="redact-status">0 phrases redacted</div>
        </div>

        <!-- Redact Type -->
        <div class="section">
          <div class="section-label">Redact Type</div>
          <div class="btn-row">
            <button class="btn btn-full" id="redact-word" data-type="word">Word</button>
            <button class="btn btn-full active" id="redact-free" data-type="free">Free</button>
          </div>
        </div>

        <!-- BPM -->
        <div class="section">
          <div class="section-label">BPM</div>
          <div class="bpm-row">
            <button class="btn btn-bpm" id="btn-bpm-dec">−</button>
            <input type="number" class="bpm-input" id="bpm-input" value="120" min="20" max="300">
            <button class="btn btn-bpm" id="btn-bpm-inc">+</button>
            <span class="bpm-label" id="effective-bpm"></span>
          </div>
          <div class="speed-row">
            <button class="btn btn-speed" data-mult="0.25">¼×</button>
            <button class="btn btn-speed" data-mult="0.5">½×</button>
            <button class="btn btn-speed active" data-mult="1">1×</button>
            <button class="btn btn-speed" data-mult="2">2×</button>
            <button class="btn btn-speed" data-mult="3">3×</button>
          </div>
        </div>

        <!-- Playback -->
        <div class="section">
          <div class="section-label">Playback</div>
          <div class="btn-row">
            <button class="btn btn-play" id="btn-play">▶ Play</button>
            <button class="btn btn-stop" id="btn-stop" disabled>■ Stop</button>
          </div>
        </div>

      </div>
    </div>
  `

  const noticeEl   = document.getElementById('notice')
  const controlsEl = document.getElementById('controls')
  const tabUrlEl   = document.getElementById('tab-url')

  // ─── Apply state from content script ─────────────────────────────────────

  function applyState(state) {
    if (!state) return
    dmState = state

    // Output mode
    document.getElementById('mode-browser')?.classList.toggle('active', state.outputMode === 'browser')
    document.getElementById('mode-remote')?.classList.toggle('active', state.outputMode === 'remote')
    const oscSection = document.getElementById('osc-section')
    if (oscSection) oscSection.style.display = state.outputMode === 'remote' ? '' : 'none'

    // OSC
    const oscStatus = document.getElementById('osc-status')
    if (oscStatus) {
      oscStatus.textContent = state.oscStatus || 'Not connected'
      oscStatus.className = 'status-line' + (state.oscConnected ? ' ok' : '')
    }
    document.getElementById('btn-osc-connect').disabled    = state.oscConnected
    document.getElementById('btn-osc-disconnect').disabled = !state.oscConnected

    // Areas
    const areaStatus = document.getElementById('area-status')
    if (areaStatus) {
      const n = state.areaCount || 0
      areaStatus.textContent = n === 0 ? 'No areas selected' : `${n} area${n !== 1 ? 's' : ''} selected`
    }

    // Redact toggle
    const redactBtn = document.getElementById('btn-toggle-redact')
    if (redactBtn) {
      redactBtn.textContent = state.highlightEnabled ? 'Disable Redact' : 'Enable Redact'
      redactBtn.classList.toggle('active', state.highlightEnabled)
    }
    const redactStatus = document.getElementById('redact-status')
    if (redactStatus) {
      const n = state.highlightCount || 0
      redactStatus.textContent = `${n} phrase${n !== 1 ? 's' : ''} redacted`
    }

    // Redact type
    document.getElementById('redact-word')?.classList.toggle('active', state.redactMode === 'word')
    document.getElementById('redact-free')?.classList.toggle('active', state.redactMode === 'free')

    // BPM
    const bpmInput = document.getElementById('bpm-input')
    if (bpmInput && document.activeElement !== bpmInput) bpmInput.value = state.bpm || 120
    const effectiveBpm = document.getElementById('effective-bpm')
    if (effectiveBpm) {
      const eff = Math.round((state.bpm || 120) * (state.speed || 1))
      effectiveBpm.textContent = state.speed !== 1 ? `= ${eff}` : ''
    }

    // Speed
    document.querySelectorAll('.btn-speed').forEach(btn => {
      btn.classList.toggle('active', parseFloat(btn.dataset.mult) === state.speed)
    })

    // Playback
    const playBtn = document.getElementById('btn-play')
    const stopBtn = document.getElementById('btn-stop')
    if (playBtn) {
      playBtn.classList.toggle('playing', state.isPlaying)
      playBtn.textContent = state.isPlaying ? '▶ Playing…' : '▶ Play'
      playBtn.disabled = state.isPlaying
    }
    if (stopBtn) stopBtn.disabled = !state.isPlaying
  }

  // ─── Load current tab ─────────────────────────────────────────────────────

  async function loadActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab) {
      noticeEl.style.display = ''
      controlsEl.style.display = 'none'
      tabUrlEl.textContent = 'No active tab'
      activeTabId = null
      return
    }

    activeTabId = tab.id
    const url    = tab.url || ''
    const isHttp = url.startsWith('http://') || url.startsWith('https://')

    try { tabUrlEl.textContent = new URL(url).hostname || url }
    catch { tabUrlEl.textContent = url }

    if (!isHttp) {
      noticeEl.textContent = 'Sequencer only works on http/https pages.'
      noticeEl.style.display = ''
      controlsEl.style.display = 'none'
      return
    }

    noticeEl.style.display = 'none'
    controlsEl.style.display = 'flex'

    const res = await sendToTab(MSG.GET_STATE)
    if (res?.state) {
      applyState(res.state)
    } else {
      applyState({ bpm: 120, speed: 1, outputMode: 'browser', oscConnected: false, oscStatus: '', highlightEnabled: false, areaCount: 0, highlightCount: 0, redactMode: 'free', isPlaying: false })
    }
  }

  // ─── Wire up controls ──────────────────────────────────────────────────────

  // Output mode
  document.querySelectorAll('[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => sendCommand(CMD.SET_OUTPUT_MODE, { value: btn.dataset.mode }))
  })

  // OSC
  document.getElementById('btn-osc-connect').addEventListener('click', () => {
    const host = document.getElementById('osc-host').value.trim() || '127.0.0.1'
    const port = parseInt(document.getElementById('osc-port').value) || 8080
    sendCommand(CMD.OSC_CONNECT, { host, port })
  })
  document.getElementById('btn-osc-disconnect').addEventListener('click', () => sendCommand(CMD.OSC_DISCONNECT))

  // Area selection
  document.getElementById('btn-select-area').addEventListener('click', () => sendCommand(CMD.SELECT_AREA))
  document.getElementById('btn-clear-areas').addEventListener('click', () => sendCommand(CMD.CLEAR_AREAS))

  // Redact
  document.getElementById('btn-toggle-redact').addEventListener('click', () => sendCommand(CMD.TOGGLE_REDACT))
  document.querySelectorAll('[data-type]').forEach(btn => {
    btn.addEventListener('click', () => sendCommand(CMD.SET_REDACT_TYPE, { value: btn.dataset.type }))
  })

  // BPM
  document.getElementById('btn-bpm-dec').addEventListener('click', () => {
    sendCommand(CMD.SET_BPM, { value: (parseInt(document.getElementById('bpm-input').value) || 120) - 5 })
  })
  document.getElementById('btn-bpm-inc').addEventListener('click', () => {
    sendCommand(CMD.SET_BPM, { value: (parseInt(document.getElementById('bpm-input').value) || 120) + 5 })
  })
  document.getElementById('bpm-input').addEventListener('change', (e) => {
    const val = parseInt(e.target.value)
    if (!isNaN(val)) sendCommand(CMD.SET_BPM, { value: val })
  })

  // Speed
  document.querySelectorAll('.btn-speed').forEach(btn => {
    btn.addEventListener('click', () => sendCommand(CMD.SET_SPEED, { value: parseFloat(btn.dataset.mult) }))
  })

  // Playback
  document.getElementById('btn-play').addEventListener('click', () => sendCommand(CMD.PLAY))
  document.getElementById('btn-stop').addEventListener('click', () => sendCommand(CMD.STOP))

  // ─── State updates pushed from content script ─────────────────────────────

  chrome.runtime.onMessage.addListener((request) => {
    if (request.type === MSG.STATE && request.state) {
      applyState(request.state)
    }
  })

  // ─── React to tab switches ────────────────────────────────────────────────

  chrome.tabs.onActivated.addListener(() => loadActiveTab())
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (tabId === activeTabId && changeInfo.status === 'complete') loadActiveTab()
  })

  // ─── Init ─────────────────────────────────────────────────────────────────

  loadActiveTab()
})
