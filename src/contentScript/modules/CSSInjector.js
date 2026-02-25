export class CSSInjector {
  /**
   * Injects CSS rules that require chrome.runtime.getURL resolution —
   * i.e. any url() reference to extension assets that cannot be expressed
   * as a relative path inside a plain CSS file loaded by a content script.
   */
  static inject() {
    if (document.getElementById('drum-machine-css-injector')) return

    const bgTexture = chrome.runtime.getURL('img/bg.jpg')

    const style = document.createElement('style')
    style.id = 'drum-machine-css-injector'

    try {
      style.textContent = `
        /* Background texture.
           Plain CSS url() in a content-script stylesheet resolves against the
           current page URL, not the extension bundle — so we must inject this
           rule from JS using chrome.runtime.getURL.

           We use a ::before pseudo-element so we can set opacity on the image
           alone without affecting the overlay's children. The JPEG is fully
           opaque by nature; opacity here is the only way to make it transparent. */
        .drum-machine-overlay {
          overflow: hidden !important;
        }

        .drum-machine-overlay::before {
          content: '' !important;
          position: absolute !important;
          inset: 0 !important;
          background-image: url('${bgTexture}') !important;
          background-size: cover !important;
          background-repeat: no-repeat !important;
          background-position: center !important;
          opacity: 0.7 !important;
          border-radius: inherit !important;
          z-index: 0 !important;
          pointer-events: none !important;
        }

        /* Ensure overlay children sit above the pseudo-element */
        .drum-machine-overlay > *:not(.close-button) {
          position: relative !important;
          z-index: 1 !important;
        }

        /* Close button must stay absolutely positioned at the top-right corner */
        .drum-machine-overlay .close-button {
          position: absolute !important;
          top: 10px !important;
          right: 10px !important;
          z-index: 2 !important;
        }
      `

      document.head.appendChild(style)
    } catch (e) {
      console.warn('CSSInjector: could not inject styles', e)
    }
  }
}

