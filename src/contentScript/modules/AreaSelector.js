const INSTRUMENTS = ['kick', 'snare', 'hihat', 'openhat', 'laser']
const REMOTE_INSTRUMENTS = ['inst1', 'inst2', 'inst3', 'inst4']

export class AreaSelector {
  constructor(onAreaSelected, onAreaRemoved) {
    this.isSelecting = false
    this._justFinishedSelecting = false
    this.selectedAreas = []
    this.areaBorderOverlays = [] // tracks borders, pills, headers, close buttons for clearAll()
    this.onAreaSelected = onAreaSelected
    this.onAreaRemoved = onAreaRemoved
    this.mode = 'browser' // 'browser' | 'remote'
  }

  /** Switch between browser and remote modes.
   *  In both modes instrument pills are visible and clickable.
   *  Browser: kick, snare, hihat, etc.  Remote: inst1, inst2, inst3, inst4 */
  setMode(mode) {
    this.mode = mode
    this.selectedAreas.forEach(areaData => {
      if (areaData.pill) {
        areaData.pill.style.display = ''
        areaData.pill.textContent = this._getPillLabel(areaData)
      }
    })
  }

  _getPillLabel(areaData) {
    const val = this.mode === 'remote'
      ? (areaData.remoteInstrument ?? REMOTE_INSTRUMENTS[0])
      : areaData.instrument
    return val.toUpperCase()
  }

  startSelection() {
    this.isSelecting = true
    const btn = document.getElementById('select-area-btn')
    if (btn) {
      btn.classList.add('active')
    }
    const hintEl = document.getElementById('area-select-hint')
    if (hintEl) {
      hintEl.style.display = ''
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
          instrument: INSTRUMENTS[0],           // browser mode: kick, snare, etc.
          remoteInstrument: REMOTE_INSTRUMENTS[0], // remote mode: inst1, inst2, etc.
          pill: null,                           // set in createAreaBorder
        }

        // Add to selected areas array
        this.selectedAreas.push(areaData)

        selector.style.display = 'none'
        this.isSelecting = false
        this._justFinishedSelecting = true
        setTimeout(() => { this._justFinishedSelecting = false }, 100)
        if (btn) {
          btn.classList.remove('active')
        }
        const hintEl = document.getElementById('area-select-hint')
        if (hintEl) {
          hintEl.style.display = 'none'
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
    areaData.border = border

    // ── Area header: pill + close button (hover to show close) ──
    const header = document.createElement('div')
    header.className = 'area-selector-header'
    header.style.position = 'absolute'
    header.style.left = areaData.x + 'px'
    header.style.top = (areaData.y - 28) + 'px'
    header.style.width = areaData.width + 'px'
    header.style.height = '28px'
    header.style.zIndex = '999998'
    header.style.display = 'flex'
    header.style.alignItems = 'center'
    header.style.justifyContent = 'center'
    header.style.pointerEvents = 'auto'

    const pill = document.createElement('button')
    pill.className = 'area-instrument-pill'
    pill.textContent = this._getPillLabel(areaData)
    pill.title = 'Click to change instrument'
    pill.style.position = 'absolute'
    pill.style.left = '50%'
    pill.style.top = '50%'
    pill.style.transform = 'translate(-50%, -50%)'
    pill.style.margin = '0'

    const closeBtn = document.createElement('button')
    closeBtn.className = 'area-close-btn'
    closeBtn.textContent = '×'
    closeBtn.title = 'Remove this area'

    pill.addEventListener('click', (e) => {
      e.stopPropagation()
      if (this.mode === 'remote') {
        const idx = REMOTE_INSTRUMENTS.indexOf(areaData.remoteInstrument)
        areaData.remoteInstrument = REMOTE_INSTRUMENTS[(idx + 1) % REMOTE_INSTRUMENTS.length]
      } else {
        const idx = INSTRUMENTS.indexOf(areaData.instrument)
        areaData.instrument = INSTRUMENTS[(idx + 1) % INSTRUMENTS.length]
      }
      pill.textContent = this._getPillLabel(areaData)
    })

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      this.removeArea(areaData)
    })

    areaData.pill = pill
    areaData.header = header
    areaData.closeBtn = closeBtn
    header.appendChild(pill)
    header.appendChild(closeBtn)
    anchorElement.appendChild(header)
    this.areaBorderOverlays.push(header)
  }

  removeArea(areaData) {
    const idx = this.selectedAreas.indexOf(areaData)
    if (idx === -1) return

    this.selectedAreas.splice(idx, 1)

    // Remove DOM elements
    if (areaData.border && areaData.border.parentNode) {
      areaData.border.parentNode.removeChild(areaData.border)
    }
    if (areaData.header && areaData.header.parentNode) {
      areaData.header.parentNode.removeChild(areaData.header)
    }
    this.areaBorderOverlays = this.areaBorderOverlays.filter(el => el !== areaData.border && el !== areaData.header)

    // Update status
    const statusEl = document.getElementById('area-status')
    if (statusEl) {
      statusEl.textContent = this.selectedAreas.length === 0
        ? 'No areas selected'
        : `${this.selectedAreas.length} area${this.selectedAreas.length !== 1 ? 's' : ''} selected`
    }

    if (this.onAreaRemoved) {
      this.onAreaRemoved(areaData)
    }
  }

  clearAll() {
    const hintEl = document.getElementById('area-select-hint')
    if (hintEl) {
      hintEl.style.display = 'none'
    }
    const btn = document.getElementById('select-area-btn')
    if (btn) {
      btn.classList.remove('active')
    }
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
