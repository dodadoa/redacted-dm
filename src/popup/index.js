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

  // ─── Helpers ───────────────────────────────────────────────────────────────

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

  /**
   * Inject the content script into a tab using the scripting API,
   * then resolve once done (or reject on error).
   */
  function injectContentScript(tabId) {
    return new Promise((resolve, reject) => {
      // Read the content script file list from the built manifest so we always
      // inject the correct hashed filename.
      const manifest = chrome.runtime.getManifest()
      const files = manifest.content_scripts?.[0]?.js ?? []
      const cssFiles = manifest.content_scripts?.[0]?.css ?? []

      if (files.length === 0) {
        reject(new Error('No content script files found in manifest'))
        return
      }

      const tasks = []

      tasks.push(new Promise((res, rej) => {
        chrome.scripting.executeScript(
          { target: { tabId }, files },
          () => chrome.runtime.lastError ? rej(new Error(chrome.runtime.lastError.message)) : res()
        )
      }))

      if (cssFiles.length > 0) {
        tasks.push(new Promise((res, rej) => {
          chrome.scripting.insertCSS(
            { target: { tabId }, files: cssFiles },
            () => chrome.runtime.lastError ? rej(new Error(chrome.runtime.lastError.message)) : res()
          )
        }))
      }

      Promise.all(tasks).then(resolve).catch(reject)
    })
  }

  /**
   * Send TOGGLE_DRUM_MACHINE.  If the content script isn't listening, inject
   * it first and retry once.
   */
  function sendToggle(tab, open) {
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_DRUM_MACHINE', open }, (response) => {
      if (chrome.runtime.lastError) {
        // Content script not present — inject it, then retry
        statusText.textContent = 'Injecting drum machine…'
        injectContentScript(tab.id)
          .then(() => {
            // Give the script a moment to initialise
            setTimeout(() => {
              chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_DRUM_MACHINE', open }, (response2) => {
                if (chrome.runtime.lastError) {
                  statusText.textContent = 'Failed to load. Try refreshing the page.'
                  isOpen = false
                  chrome.storage.local.set({ drumMachineOpen: false })
                  updateButtonState()
                } else {
                  updateButtonState()
                }
              })
            }, 300)
          })
          .catch((err) => {
            statusText.textContent = `Error: ${err.message}`
            isOpen = false
            chrome.storage.local.set({ drumMachineOpen: false })
            updateButtonState()
          })
      } else {
        updateButtonState()
      }
    })
  }

  // ─── Initial state sync ────────────────────────────────────────────────────

  chrome.storage.local.get(['drumMachineOpen'], function (result) {
    isOpen = result.drumMachineOpen || false

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs[0]) { updateButtonState(); return }

      const tab = tabs[0]
      const url = tab.url || ''

      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        isOpen = false
        chrome.storage.local.set({ drumMachineOpen: false })
        updateButtonState()
        return
      }

      chrome.tabs.sendMessage(tab.id, { type: 'GET_DRUM_MACHINE_STATE' }, function (response) {
        if (!chrome.runtime.lastError && response) {
          isOpen = response.open
          chrome.storage.local.set({ drumMachineOpen: isOpen })
        }
        updateButtonState()
      })
    })
  })

  // ─── Toggle button ─────────────────────────────────────────────────────────

  toggleButton.addEventListener('click', function () {
    isOpen = !isOpen
    chrome.storage.local.set({ drumMachineOpen: isOpen })

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs[0]) {
        statusText.textContent = 'No active tab found'
        return
      }

      const tab = tabs[0]
      const url = tab.url || ''

      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        statusText.textContent = 'Drum machine only works on http/https pages'
        isOpen = false
        chrome.storage.local.set({ drumMachineOpen: false })
        updateButtonState()
        return
      }

      sendToggle(tab, isOpen)
    })
  })

  // ─── State updates from content script ────────────────────────────────────

  chrome.runtime.onMessage.addListener((request) => {
    if (request.type === 'DRUM_MACHINE_STATE') {
      isOpen = request.open
      updateButtonState()
    }
  })
})
