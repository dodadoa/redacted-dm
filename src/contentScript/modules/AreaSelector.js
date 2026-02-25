export class AreaSelector {
  constructor(onAreaSelected) {
    this.isSelecting = false
    this.selectedAreas = []
    this.areaBorderOverlays = []
    this.onAreaSelected = onAreaSelected
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
          viewportY: rect.top
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

    // Create border overlay anchored to the element
    const border = document.createElement('div')
    border.className = 'area-border-overlay'
    
    // Position relative to anchor element
    const anchorElement = areaData.anchorElement || document.body
    
    // Set position relative to anchor element
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
    
    // Ensure anchor element has relative positioning
    const computedStyle = window.getComputedStyle(anchorElement)
    if (computedStyle.position === 'static') {
      anchorElement.style.position = 'relative'
    }
    
    // Append to anchor element
    anchorElement.appendChild(border)
    this.areaBorderOverlays.push(border)
  }

  clearAll() {
    // Remove all border overlays
    this.areaBorderOverlays.forEach(overlay => {
      if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay)
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

