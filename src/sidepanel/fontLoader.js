/**
 * Applies font-family rules for the side panel.
 * Fonts are loaded via /fonts.css in the HTML.
 */
export function loadFonts() {
  if (document.getElementById('drum-machine-fonts')) return

  const style = document.createElement('style')
  style.id = 'drum-machine-fonts'
  style.textContent = `
    body,
    #app,
    #app *,
    button,
    input,
    .btn,
    .section-label,
    .status-line,
    .notice,
    .bpm-input,
    .osc-input,
    .bpm-label,
    .osc-colon {
      font-family: 'Steps Mono', 'Courier New', monospace !important;
      font-weight: 300 !important;
    }
    #app header h1,
    #app h1,
    #app h2,
    #app h3,
    #app .section-label {
      font-family: 'Basteleur', system-ui, sans-serif !important;
    }
  `
  ;(document.head || document.documentElement).appendChild(style)
}
