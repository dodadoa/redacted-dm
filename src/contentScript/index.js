import './index.css'
import { DrumMachine } from './modules/DrumMachine.js'
import { MSG } from '../shared/messages.js'

console.info('contentScript is running')

let drumMachine = null

function initDrumMachine() {
  if (!drumMachine) {
    try {
      drumMachine = new DrumMachine()

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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === MSG.TOGGLE) {
    if (!drumMachine) initDrumMachine()
    if (drumMachine) {
      try {
        if (request.open) {
          drumMachine.showOverlay()
        } else {
          drumMachine.hideOverlay()
        }
        chrome.storage.local.set({ drumMachineOpen: request.open })
        sendResponse({ success: true })
      } catch (e) {
        console.error('[DrumMachine] toggle error:', e)
        sendResponse({ success: false, error: e.message })
      }
    } else {
      sendResponse({ success: false, error: 'DrumMachine failed to initialise' })
    }
    return true
  }

  if (request.type === MSG.GET_STATE) {
    const overlay = document.getElementById('drum-machine-overlay')
    const isOpen = overlay ? overlay.style.display !== 'none' : false
    const state = drumMachine ? drumMachine.getState() : null
    sendResponse({ open: isOpen, state })
    return true
  }

  if (request.type === MSG.COMMAND) {
    if (!drumMachine) initDrumMachine()
    if (drumMachine) {
      try {
        drumMachine.handleCommand(request.action, request.data || {})
        sendResponse({ success: true, state: drumMachine.getState() })
      } catch (e) {
        console.error('[DrumMachine] command error:', e)
        sendResponse({ success: false, error: e.message })
      }
    } else {
      sendResponse({ success: false, error: 'DrumMachine failed to initialise' })
    }
    return true
  }
})

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDrumMachine)
} else {
  initDrumMachine()
}
