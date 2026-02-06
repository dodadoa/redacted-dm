export class FontLoader {
  static load() {
    // Check if fonts are already loaded
    if (document.getElementById('basteleur-fonts')) return
    
    // Build URLs using chrome.runtime.getURL so fonts can live in public/fonts
    // per https://stackoverflow.com/questions/19210451/packaging-a-font-with-a-google-chrome-extension
    const moonlightWoff2 = chrome.runtime.getURL('fonts/Basteleur-Moonlight.woff2')
    const moonlightWoff = chrome.runtime.getURL('fonts/Basteleur-Moonlight.woff')
    const boldWoff2 = chrome.runtime.getURL('fonts/Basteleur-Bold.woff2')
    const boldWoff = chrome.runtime.getURL('fonts/Basteleur-Bold.woff')

    // Inject font-face declarations
    const style = document.createElement('style')
    style.id = 'basteleur-fonts'
    
    try {
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
        
        .drum-machine-overlay,
        .drum-machine-overlay * {
          font-family: 'Basteleur', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        }
      `
      
      document.head.appendChild(style)
      
      // Wait for fonts to load
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => {
          console.log('Fonts loaded')
          const overlay = document.getElementById('drum-machine-overlay')
          if (overlay) {
            overlay.style.fontFamily = "'Basteleur', system-ui, sans-serif"
          }
        }).catch(e => {
          console.warn('Font loading error:', e)
        })
      }
    } catch (e) {
      console.warn('Could not load fonts:', e)
    }
  }
}

