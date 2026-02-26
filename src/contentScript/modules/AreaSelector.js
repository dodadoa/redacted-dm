const INSTRUMENTS = ['kick', 'snare', 'hihat', 'openhat', 'crash']

export class AreaSelector {
  constructor(onAreaSelected) {
    this.isSelecting = false
    this.selectedAreas = []
    this.areaBorderOverlays = [] // tracks borders AND pills for clearAll()
    this.onAreaSelected = onAreaSelected
    this.mode = 'browser' // 'browser' | 'remote'
  }

  /** Switch between browser and remote modes.
   *  In browser mode instrument pills are interactive.
   *  In remote mode pills are hidden (instrument is irrelevant for OSC). */
  setMode(mode) {
    this.mode = mode
    this.selectedAreas.forEach(areaData => {
      if (areaData.pill) {
        areaData.pill.style.display = mode === 'browser' ? '' : 'none'
      }
    })
  }

  startSelection() {
    this.isSelecting = true
    const btn = document.getElementById('select-area-btn')
    if (btn) {
      btn.textContent = 'Selecting... (Click and drag)'
      btn.disabled = true
    }

    // Clear any existing text selection
    const selection = window.getSelection()
    if (selection) {
      selection.removeAllRanges()
    }

    // Remove existing selector if any
    const existing = document.getElementById('rectangle-selector')
    if (existing) existing.remove()

    // Create selector element
    const selector = document.createElement('div')
    selector.id = 'rectangle-selector'
    selector.className = 'rectangle-selector'
    document.body.appendChild(selector)

    // Prevent text selection during area selection
    document.body.style.userSelect = 'none'
    document.body.style.webkitUserSelect = 'none'

    let startX, startY

    const onMouseDown = (e) => {
      e.preventDefault()
      startX = e.clientX
      startY = e.clientY
      selector.style.left = startX + 'px'
      selector.style.top = startY + 'px'
      selector.style.width = '0px'
      selector.style.height = '0px'
      selector.style.display = 'block'

      const onMouseMove = (e) => {
        e.preventDefault()
        const width = Math.abs(e.clientX - startX)
        const height = Math.abs(e.clientY - startY)
        selector.style.left = Math.min(e.clientX, startX) + 'px'
        selector.style.top = Math.min(e.clientY, startY) + 'px'
        selector.style.width = width + 'px'
        selector.style.height = height + 'px'
      }

      const onMouseUp = (e) => {
        e.preventDefault()
        const rect = selector.getBoundingClientRect()
        
        // Find the element that contains this area
        const elementAtCenter = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2
        )
        
        // Find a suitable parent element to anchor to
        let anchorElement = elementAtCenter
        if (anchorElement) {
          // Walk up the DOM tree to find a good anchor (not body/html)
          while (anchorElement && 
                 (anchorElement === document.body || 
                  anchorElement === document.documentElement ||
                  anchorElement.tagName === 'BODY' ||
                  anchorElement.tagName === 'HTML')) {
            anchorElement = anchorElement.parentElement
          }
        }
        
        // If no suitable element found, use body
        if (!anchorElement) {
          anchorElement = document.body
        }
        
        // Get the bounding rect of the anchor element
        const anchorRect = anchorElement.getBoundingClientRect()
        
        // Calculate position relative to anchor element
        const areaData = {
          x: rect.left - anchorRect.left,
          y: rect.top - anchorRect.top,
          width: rect.width,
          height: rect.height,
          anchorElement: anchorElement,
          viewportX: rect.left,
          viewportY: rect.top,
          instrument: INSTRUMENTS[0], // default instrument
          pill: null,                 // set in createAreaBorder
        }

        // Add to selected areas array
        this.selectedAreas.push(areaData)

        selector.style.display = 'none'
        this.isSelecting = false
        if (btn) {
          btn.textContent = 'Select Area'
          btn.disabled = false
        }
        
        const statusEl = document.getElementById('area-status')
        if (statusEl) {
          statusEl.textContent = 
            `${this.selectedAreas.length} area${this.selectedAreas.length !== 1 ? 's' : ''} selected`
        }

        // Restore text selection
        document.body.style.userSelect = ''
        document.body.style.webkitUserSelect = ''

        // Create border overlay for selected area
        this.createAreaBorder(areaData)
        
        // Notify callback
        if (this.onAreaSelected) {
          this.onAreaSelected(areaData)
        }

        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp, { once: true })
    }

    document.addEventListener('mousedown', onMouseDown, { once: true })
  }

  createAreaBorder(areaData) {
    if (!areaData) return

    const anchorElement = areaData.anchorElement || document.body

    // Ensure anchor element has relative positioning so children are offset from it
    const computedStyle = window.getComputedStyle(anchorElement)
    if (computedStyle.position === 'static') {
      anchorElement.style.position = 'relative'
    }

    // ── Dashed border (pointer-events:none so it never blocks page interaction) ──
    const border = document.createElement('div')
    border.className = 'area-border-overlay'
    border.style.position = 'absolute'
    border.style.left = areaData.x + 'px'
    border.style.top = areaData.y + 'px'
    border.style.width = areaData.width + 'px'
    border.style.height = areaData.height + 'px'
    border.style.border = '0.5px dashed rgb(0, 0, 0)'
    border.style.pointerEvents = 'none'
    border.style.zIndex = '999997'
    border.style.boxSizing = 'border-box'
    border.style.background = 'transparent'
    border.style.borderRadius = '4px'

    anchorElement.appendChild(border)
    this.areaBorderOverlays.push(border)

    // ── Instrument pill (sibling of border — NOT a child — so pointer-events work) ──
    const pill = document.createElement('button')
    pill.className = 'area-instrument-pill'
    pill.textContent = areaData.instrument.toUpperCase()
    pill.title = 'Click to change instrument'

    // Position pill centred above the top edge of the border
    pill.style.position = 'absolute'
    pill.style.left = (areaData.x + areaData.width / 2) + 'px'
    pill.style.top = areaData.y + 'px'
    pill.style.transform = 'translate(-50%, -100%)'
    pill.style.zIndex = '999998'

    // Only show in browser mode
    pill.style.display = this.mode === 'browser' ? '' : 'none'

    pill.addEventListener('click', (e) => {
      e.stopPropagation()
      const idx = INSTRUMENTS.indexOf(areaData.instrument)
      areaData.instrument = INSTRUMENTS[(idx + 1) % INSTRUMENTS.length]
      pill.textContent = areaData.instrument.toUpperCase()
    })

    areaData.pill = pill
    anchorElement.appendChild(pill)
    this.areaBorderOverlays.push(pill) // tracked so clearAll() removes it
  }

  clearAll() {
    // Remove all border overlays and pills
    this.areaBorderOverlays.forEach(el => {
      if (el && el.parentNode) {
        el.parentNode.removeChild(el)
      }
    })
    this.areaBorderOverlays = []
    
    // Clear selected areas
    this.selectedAreas = []
    
    // Update UI
    const statusEl = document.getElementById('area-status')
    if (statusEl) {
      statusEl.textContent = 'No areas selected'
    }
  }

  getSelectedAreas() {
    return this.selectedAreas
  }
}
