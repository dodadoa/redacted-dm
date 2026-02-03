import './index.css'

document.addEventListener('DOMContentLoaded', () => {
  const appElement = document.getElementById('app')

  // Create the main element
  const mainElement = document.createElement('main')

  // Create the title element
  const h3Element = document.createElement('h3')
  h3Element.textContent = 'Drum Machine'

  // Create toggle button
  const toggleButton = document.createElement('button')
  toggleButton.className = 'toggle-button'
  toggleButton.id = 'toggle-drum-machine'
  toggleButton.textContent = 'Open Drum Machine'

  // Create status text
  const statusText = document.createElement('div')
  statusText.className = 'status-text'
  statusText.id = 'status-text'
  statusText.textContent = 'Click to toggle the drum machine overlay'

  // Append all elements to the main element
  mainElement.appendChild(h3Element)
  mainElement.appendChild(toggleButton)
  mainElement.appendChild(statusText)

  // Append the main element to the page
  appElement.appendChild(mainElement)

  let isOpen = false

  // Get current state from storage and sync with content script
  chrome.storage.local.get(['drumMachineOpen'], function (result) {
    isOpen = result.drumMachineOpen || false
    
    // Also check actual state from content script
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs[0]) {
        updateButtonState()
        return
      }
      
      const tab = tabs[0]
      const url = tab.url || ''
      
      // Only check state on http/https pages
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        isOpen = false
        chrome.storage.local.set({ drumMachineOpen: false })
        updateButtonState()
        return
      }
      
      chrome.tabs.sendMessage(tab.id, {
        type: 'GET_DRUM_MACHINE_STATE'
      }, function (response) {
        if (!chrome.runtime.lastError && response) {
          // Sync with actual state
          isOpen = response.open
          chrome.storage.local.set({ drumMachineOpen: isOpen })
        }
        updateButtonState()
      })
    })
  })

  function updateButtonState() {
    if (isOpen) {
      toggleButton.textContent = 'Close Drum Machine'
      toggleButton.classList.add('active')
      statusText.textContent = 'Drum machine is open on the current page'
    } else {
      toggleButton.textContent = 'Open Drum Machine'
      toggleButton.classList.remove('active')
      statusText.textContent = 'Click to open the drum machine overlay'
    }
  }

  // Toggle button click handler
  toggleButton.addEventListener('click', function () {
    isOpen = !isOpen
    
    // Save state
    chrome.storage.local.set({ drumMachineOpen: isOpen })
    
    // Send message to content script
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs[0]) {
        statusText.textContent = 'No active tab found'
        return
      }
      
      const tab = tabs[0]
      const url = tab.url || ''
      
      // Check if this is a page where content scripts can run
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        statusText.textContent = 'Drum machine only works on http/https pages'
        isOpen = false
        chrome.storage.local.set({ drumMachineOpen: false })
        updateButtonState()
        return
      }
      
      chrome.tabs.sendMessage(tab.id, {
        type: 'TOGGLE_DRUM_MACHINE',
        open: isOpen
      }, function (response) {
        if (chrome.runtime.lastError) {
          // Content script not loaded - this shouldn't happen on http/https pages
          // but if it does, show a helpful message
          statusText.textContent = 'Content script not loaded. Please refresh the page.'
          isOpen = false
          chrome.storage.local.set({ drumMachineOpen: false })
          updateButtonState()
        } else {
          // Message sent successfully
          updateButtonState()
        }
      })
    })
  })

  // Listen for state changes from content script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'DRUM_MACHINE_STATE') {
      isOpen = request.open
      updateButtonState()
    }
  })
})
