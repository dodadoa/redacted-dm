import './index.css'
import { DrumMachine } from './modules/DrumMachine.js'

console.info('contentScript is running')

// Initialize drum machine when content script loads
let drumMachine = null

function initDrumMachine() {
  if (!drumMachine) {
    try {
      drumMachine = new DrumMachine()

      // Restore open/closed state from storage
      chrome.storage.local.get(['drumMachineOpen'], function (result) {
        const isOpen = result.drumMachineOpen || false
        if (isOpen) {
          drumMachine.showOverlay()
        } else {
          drumMachine.hideOverlay()
        }
      })
    } catch (e) {
      console.error('[DrumMachine] init error:', e)
      drumMachine = null
    }
  }
  return drumMachine
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'TOGGLE_DRUM_MACHINE') {
    if (!drumMachine) initDrumMachine()

    if (drumMachine) {
      try {
        if (request.open) {
          drumMachine.showOverlay()
        } else {
          drumMachine.hideOverlay()
        }
        sendResponse({ success: true })
      } catch (e) {
        console.error('[DrumMachine] toggle error:', e)
        sendResponse({ success: false, error: e.message })
      }
    } else {
      sendResponse({ success: false, error: 'DrumMachine failed to initialise' })
    }
    return true // keep channel open
  }

  if (request.type === 'GET_DRUM_MACHINE_STATE') {
    const overlay = document.getElementById('drum-machine-overlay')
    const isOpen = overlay ? overlay.style.display !== 'none' : false
    sendResponse({ open: isOpen })
    return true
  }
})

// Wait for DOM to be ready before creating the drum machine
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDrumMachine)
} else {
  initDrumMachine()
}
