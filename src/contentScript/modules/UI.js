export class UI {
  constructor() {
    this.overlay = null
  }

  create() {
    // Create overlay container
    const overlay = document.createElement('div')
    overlay.className = 'drum-machine-overlay'
    overlay.id = 'drum-machine-overlay'
    
    overlay.innerHTML = `
      <button class="close-button" id="drum-machine-close">×</button>
      <h3>Self-censored<br>Step Sequencer</h3>
      <div class="drum-machine-controls">
        <div class="control-group">
          <label>Area Selection</label>
          <div class="control-row">
            <button class="drum-machine-button" id="select-area-btn">Select Area</button>
            <button class="drum-machine-button" id="clear-areas-btn">Clear All</button>
          </div>
          <div class="status-text" id="area-status">No areas selected</div>
        </div>
        <div class="control-group">
          <label>Redact Mode</label>
          <button class="drum-machine-button" id="highlight-toggle-btn">Enable Redact</button>
          <div class="status-text" id="highlight-status">0 phrases redacted</div>
        </div>
        <div class="control-group">
          <label>Redact Type</label>
          <div class="control-row">
            <button class="drum-machine-button redact-mode-btn" id="redact-mode-word" data-mode="word">Word</button>
            <button class="drum-machine-button redact-mode-btn active" id="redact-mode-free" data-mode="free">Free</button>
          </div>
          <div class="status-text" id="redact-mode-status">Free highlight mode</div>
        </div>
        <div class="control-group">
          <label>BPM</label>
          <div class="control-row">
            <input type="number" class="bpm-input" id="bpm-input" value="120" min="60" max="200">
            <button class="drum-machine-button" id="bpm-decrease">-</button>
            <button class="drum-machine-button" id="bpm-increase">+</button>
          </div>
        </div>
        <div class="control-group">
          <label>Playback</label>
          <div class="control-row">
            <button class="drum-machine-button" id="play-btn">Play</button>
            <button class="drum-machine-button" id="stop-btn" disabled>Stop</button>
          </div>
        </div>
        <div class="info-text">
          Instructions:<br>
          1. Click "Select Area" and drag to define the rectangle<br>
          2. Enable "Redact Mode" toggle<br>
          3. Select text/phrases in the area to redact them<br>
          4. Adjust BPM and click Play
        </div>
      </div>
    `
    
    document.body.appendChild(overlay)
    
    // Make overlay draggable
    this.makeDraggable(overlay)
    
    // Hide overlay by default
    overlay.style.display = 'none'
    
    this.overlay = overlay
  }

  makeDraggable(element) {
    let isDragging = false
    let currentX
    let currentY
    let initialX
    let initialY

    const header = element.querySelector('h3')
    if (!header) return

    header.style.cursor = 'move'
    header.style.userSelect = 'none'

    header.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('close-button')) return
      
      initialX = e.clientX - element.offsetLeft
      initialY = e.clientY - element.offsetTop

      if (e.target === header || header.contains(e.target)) {
        isDragging = true
      }
    })

    document.addEventListener('mousemove', (e) => {
      if (isDragging) {
        e.preventDefault()
        currentX = e.clientX - initialX
        currentY = e.clientY - initialY

        element.style.left = currentX + 'px'
        element.style.top = currentY + 'px'
        element.style.right = 'auto'
      }
    })

    document.addEventListener('mouseup', () => {
      isDragging = false
    })
  }

  show() {
    if (this.overlay) {
      this.overlay.style.display = 'block'
      this.overlay.style.visibility = 'visible'
      this.overlay.style.opacity = '1'
      
      // Send state back to popup
      chrome.runtime.sendMessage({
        type: 'DRUM_MACHINE_STATE',
        open: true
      }).catch(() => {
        // Ignore errors if popup is closed
      })
    }
  }

  hide() {
    if (this.overlay) {
      this.overlay.style.display = 'none'
      
      // Send state back to popup
      chrome.runtime.sendMessage({
        type: 'DRUM_MACHINE_STATE',
        open: false
      }).catch(() => {
        // Ignore errors if popup is closed
      })
    }
  }

  isVisible() {
    return this.overlay && this.overlay.style.display !== 'none'
  }

  getOverlay() {
    return this.overlay
  }
}

