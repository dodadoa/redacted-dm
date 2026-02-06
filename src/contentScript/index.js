import './index.css'
import { DrumMachine } from './modules/DrumMachine.js'

console.info('contentScript is running')

// Initialize drum machine when content script loads
let drumMachine = null

function initDrumMachine() {
  if (!drumMachine) {
    drumMachine = new DrumMachine()
    
    // Check initial state from storage and show/hide accordingly
    chrome.storage.local.get(['drumMachineOpen'], function (result) {
      const isOpen = result.drumMachineOpen || false
      if (isOpen) {
        drumMachine.showOverlay()
      } else {
        drumMachine.hideOverlay()
      }
    })
  }
  return drumMachine
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'TOGGLE_DRUM_MACHINE') {
    if (!drumMachine) {
      initDrumMachine()
    }
    
    if (drumMachine) {
      if (request.open) {
        drumMachine.showOverlay()
      } else {
        drumMachine.hideOverlay()
      }
      sendResponse({ success: true })
    } else {
      sendResponse({ success: false })
    }
    return true // Keep message channel open for async response
  }
  
  // Also listen for state sync requests
  if (request.type === 'GET_DRUM_MACHINE_STATE') {
    const overlay = document.getElementById('drum-machine-overlay')
    const isOpen = overlay && overlay.style.display !== 'none'
    sendResponse({ open: isOpen })
    return true
  }
})

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDrumMachine)
} else {
  initDrumMachine()
}
