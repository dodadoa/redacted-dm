/**
 * Loads fonts for the content script overlay.
 * Uses chrome.runtime.getURL because the overlay runs in a web page context.
 */
export class FontLoader {
  static load() {
    if (document.getElementById('drum-machine-fonts')) return

    const moonlightWoff2 = chrome.runtime.getURL('fonts/Basteleur-Moonlight.woff2')
    const moonlightWoff = chrome.runtime.getURL('fonts/Basteleur-Moonlight.woff')
    const boldWoff2 = chrome.runtime.getURL('fonts/Basteleur-Bold.woff2')
    const boldWoff = chrome.runtime.getURL('fonts/Basteleur-Bold.woff')
    const stepsMono = chrome.runtime.getURL('fonts/Steps-Mono.otf')
    const stepsMonoThin = chrome.runtime.getURL('fonts/Steps-Mono-Thin.otf')

    const style = document.createElement('style')
    style.id = 'drum-machine-fonts'
    style.textContent = `
      @font-face {
        font-family: 'Basteleur';
        src: url('${moonlightWoff2}') format('woff2'),
             url('${moonlightWoff}') format('woff');
        font-weight: normal;
        font-style: normal;
        font-display: swap;
      }
      @font-face {
        font-family: 'Basteleur';
        src: url('${boldWoff2}') format('woff2'),
             url('${boldWoff}') format('woff');
        font-weight: bold;
        font-style: normal;
        font-display: swap;
      }
      @font-face {
        font-family: 'Steps Mono';
        src: url('${stepsMono}') format('opentype');
        font-weight: normal;
        font-style: normal;
        font-display: swap;
      }
      @font-face {
        font-family: 'Steps Mono';
        src: url('${stepsMonoThin}') format('opentype');
        font-weight: 300;
        font-style: normal;
        font-display: swap;
      }
      .drum-machine-overlay,
      .drum-machine-overlay button,
      .drum-machine-overlay input,
      .drum-machine-overlay .status-text,
      .drum-machine-overlay .info-text {
        font-family: 'Steps Mono', 'Courier New', monospace !important;
        font-weight: 300 !important;
      }
      .drum-machine-overlay h1,
      .drum-machine-overlay h2,
      .drum-machine-overlay h3,
      .drum-machine-overlay h4,
      .drum-machine-overlay h5,
      .drum-machine-overlay h6,
      .drum-machine-overlay label {
        font-family: 'Basteleur', system-ui, sans-serif !important;
      }
    `
    ;(document.head || document.documentElement).appendChild(style)
  }
}
