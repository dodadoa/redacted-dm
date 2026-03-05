/**
 * Shared Chrome extension utility functions.
 * Safe to import from any extension context: popup, side panel, content script.
 */
import { MSG } from './messages.js'

/**
 * Injects the content script (and CSS) into a tab by reading the file list
 * from the built manifest, so hashed filenames are always correct.
 *
 * @param {number} tabId
 * @returns {Promise<void>}
 */
export function injectContentScript(tabId) {
  const manifest = chrome.runtime.getManifest()
  const js  = manifest.content_scripts?.[0]?.js  ?? []
  const css = manifest.content_scripts?.[0]?.css ?? []

  if (js.length === 0) {
    return Promise.reject(new Error('No content script files found in manifest'))
  }

  const tasks = [
    new Promise((resolve, reject) =>
      chrome.scripting.executeScript({ target: { tabId }, files: js }, () =>
        chrome.runtime.lastError
          ? reject(new Error(chrome.runtime.lastError.message))
          : resolve()
      )
    ),
  ]

  if (css.length > 0) {
    tasks.push(
      new Promise((resolve, reject) =>
        chrome.scripting.insertCSS({ target: { tabId }, files: css }, () =>
          chrome.runtime.lastError
            ? reject(new Error(chrome.runtime.lastError.message))
            : resolve()
        )
      )
    )
  }

  return Promise.all(tasks)
}

/**
 * Send a message to a specific tab and resolve with the response.
 * Never rejects — on error resolves with `{ success: false, error }`.
 *
 * @param {number} tabId
 * @param {string} type   Message type (use MSG constants)
 * @param {object} payload
 * @returns {Promise<object>}
 */
export function sendToTab(tabId, type, payload = {}) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type, ...payload }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message })
      } else {
        resolve(response || { success: true })
      }
    })
  })
}

/**
 * Send a DRUM_MACHINE_COMMAND to a tab.
 * If the content script is not yet present, injects it and retries once.
 *
 * @param {number} tabId
 * @param {string} action  Command action (use CMD constants)
 * @param {object} data    Action payload
 * @returns {Promise<object>} Response from the content script
 */
export async function sendCommand(tabId, action, data = {}) {
  let res = await sendToTab(tabId, MSG.COMMAND, { action, data })

  if (!res.success) {
    try {
      await injectContentScript(tabId)
      await new Promise(r => setTimeout(r, 350))
      res = await sendToTab(tabId, MSG.COMMAND, { action, data })
    } catch (e) {
      console.error('[Extension] content script inject failed:', e)
    }
  }

  return res
}
