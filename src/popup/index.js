import './index.css'
import { MSG } from '../shared/messages.js'
import { injectContentScript, sendToTab } from '../shared/extension.js'

document.addEventListener('DOMContentLoaded', () => {
  // ─── Render shell ─────────────────────────────────────────────────────────

  document.getElementById('app').innerHTML = `
    <header>
      <h1>Self-censored<br>Step Sequencer</h1>
      <div class="tab-host" id="tab-host">—</div>
    </header>

    <div class="options">
      <button class="option-btn" id="btn-sidepanel" disabled>
        <span class="option-icon">◫</span>
        <span class="option-text">
          <span class="option-label">Side Panel</span>
          <span class="option-desc">Controller in browser panel</span>
        </span>
      </button>

      <button class="option-btn" id="btn-overlay" disabled>
        <span class="option-icon">▣</span>
        <span class="option-text">
          <span class="option-label">Overlay</span>
          <span class="option-desc">Full controls over the page</span>
        </span>
      </button>
    </div>

    <div class="footer">
      <div class="status-msg" id="status-msg"></div>
    </div>
  `

  const tabHostEl    = document.getElementById('tab-host')
  const sidepanelBtn = document.getElementById('btn-sidepanel')
  const overlayBtn   = document.getElementById('btn-overlay')
  const statusMsg    = document.getElementById('status-msg')

  let currentTab  = null
  let overlayOpen = false

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function setStatus(msg, warn = false) {
    statusMsg.textContent = msg
    statusMsg.className = 'status-msg' + (warn ? ' warn' : '')
  }

  function updateOverlayBtn() {
    overlayBtn.classList.toggle('active', overlayOpen)
    overlayBtn.querySelector('.option-desc').textContent = overlayOpen
      ? 'Active on page — click to hide'
      : 'Full controls over the page'
  }

  async function sendToggleOverlay(tab, open) {
    let res = await sendToTab(tab.id, MSG.TOGGLE, { open })
    if (!res.success) {
      setStatus('Injecting…')
      try {
        await injectContentScript(tab.id)
        await new Promise(r => setTimeout(r, 320))
        res = await sendToTab(tab.id, MSG.TOGGLE, { open })
        if (!res.success) throw new Error('Content script not responding')
      } catch (err) {
        setStatus(`Error: ${err.message}`, true)
        overlayOpen = false
        chrome.storage.local.set({ drumMachineOpen: false })
        updateOverlayBtn()
        return
      }
    }
    chrome.storage.local.set({ drumMachineOpen: open })
    setStatus('')
    updateOverlayBtn()
  }

  // ─── Initial state ────────────────────────────────────────────────────────

  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    if (!tabs[0]) { setStatus('No active tab found.', true); return }

    currentTab = tabs[0]
    const url    = currentTab.url || ''
    const isHttp = url.startsWith('http://') || url.startsWith('https://')

    try { tabHostEl.textContent = new URL(url).hostname || url }
    catch { tabHostEl.textContent = url || '—' }

    if (!isHttp) { setStatus('Only works on http/https pages.', true); return }

    sidepanelBtn.disabled = false
    overlayBtn.disabled   = false

    const res = await sendToTab(currentTab.id, MSG.GET_STATE)
    overlayOpen = res?.open ?? res?.state?.overlayOpen ?? false
    updateOverlayBtn()
  })

  // ─── Side panel button ────────────────────────────────────────────────────

  sidepanelBtn.addEventListener('click', () => {
    if (!currentTab) return
    chrome.sidePanel.open({ tabId: currentTab.id })
  })

  // ─── Overlay button ───────────────────────────────────────────────────────

  overlayBtn.addEventListener('click', () => {
    if (!currentTab) return
    overlayOpen = !overlayOpen
    sendToggleOverlay(currentTab, overlayOpen)
  })

  // ─── Live state push from content script ──────────────────────────────────

  chrome.runtime.onMessage.addListener((request) => {
    if (request.type === MSG.STATE) {
      overlayOpen = request.state?.overlayOpen ?? request.open ?? overlayOpen
      updateOverlayBtn()
    }
  })
})
