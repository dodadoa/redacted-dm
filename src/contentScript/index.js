import './index.css'

console.info('contentScript is running')

class DrumMachine {
  constructor() {
    this.isSelecting = false
    this.selectedArea = null
    this.highlightedWords = []
    this.allTextElements = [] // All text elements in the selected area
    this.isPlaying = false
    this.currentStep = 0
    this.bpm = 120
    this.intervalId = null
    this.audioContext = null
    this.drumSounds = {}
    this.sequencerSteps = 16
    this.stepInterval = null
    this.highlightModeEnabled = false
    this.redactMode = 'free' // 'word' or 'free'
    this.areaBorderOverlay = null
    this.currentTextBorder = null
    
    this.init()
  }

  init() {
    this.createUI()
    this.initAudio()
    this.setupEventListeners()
  }

  createUI() {
    // Create overlay container
    const overlay = document.createElement('div')
    overlay.className = 'drum-machine-overlay'
    overlay.id = 'drum-machine-overlay'
    
    overlay.innerHTML = `
      <button class="close-button" id="drum-machine-close">×</button>
      <h3>Drum Machine</h3>
      <div class="drum-machine-controls">
        <div class="control-group">
          <label>Area Selection</label>
          <button class="drum-machine-button" id="select-area-btn">Select Area</button>
          <div class="status-text" id="area-status">No area selected</div>
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

  initAudio() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)()
      this.createDrumSounds()
    } catch (e) {
      console.error('Audio context initialization failed:', e)
    }
  }

  createDrumSounds() {
    // Create different drum sounds using Web Audio API
    const drumTypes = ['kick', 'snare', 'hihat', 'openhat', 'crash']
    
    drumTypes.forEach((type, index) => {
      this.drumSounds[type] = () => {
        if (!this.audioContext) return
        
        const oscillator = this.audioContext.createOscillator()
        const gainNode = this.audioContext.createGain()
        
        oscillator.connect(gainNode)
        gainNode.connect(this.audioContext.destination)
        
        const now = this.audioContext.currentTime
        
        switch (type) {
          case 'kick':
            oscillator.frequency.setValueAtTime(60, now)
            oscillator.frequency.exponentialRampToValueAtTime(30, now + 0.1)
            gainNode.gain.setValueAtTime(1, now)
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3)
            oscillator.type = 'sine'
            break
          case 'snare':
            oscillator.frequency.setValueAtTime(200, now)
            oscillator.frequency.exponentialRampToValueAtTime(50, now + 0.1)
            gainNode.gain.setValueAtTime(0.7, now)
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2)
            oscillator.type = 'triangle'
            break
          case 'hihat':
            oscillator.frequency.setValueAtTime(8000, now)
            oscillator.frequency.exponentialRampToValueAtTime(1000, now + 0.05)
            gainNode.gain.setValueAtTime(0.3, now)
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1)
            oscillator.type = 'square'
            break
          case 'openhat':
            oscillator.frequency.setValueAtTime(10000, now)
            oscillator.frequency.exponentialRampToValueAtTime(2000, now + 0.15)
            gainNode.gain.setValueAtTime(0.4, now)
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2)
            oscillator.type = 'square'
            break
          case 'crash':
            oscillator.frequency.setValueAtTime(12000, now)
            oscillator.frequency.exponentialRampToValueAtTime(3000, now + 0.3)
            gainNode.gain.setValueAtTime(0.5, now)
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.4)
            oscillator.type = 'sawtooth'
            break
        }
        
        oscillator.start(now)
        oscillator.stop(now + 0.5)
      }
    })
  }

  playDrumSound(wordIndex) {
    if (!this.audioContext) return
    
    // Resume audio context if suspended (required by some browsers)
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume()
    }
    
    const drumTypes = Object.keys(this.drumSounds)
    const drumType = drumTypes[wordIndex % drumTypes.length]
    
    if (this.drumSounds[drumType]) {
      this.drumSounds[drumType]()
    }
  }

  setupEventListeners() {
    // Close button
    document.getElementById('drum-machine-close').addEventListener('click', () => {
      this.stop()
      document.getElementById('drum-machine-overlay').remove()
    })

    // Select area button
    document.getElementById('select-area-btn').addEventListener('click', () => {
      this.startAreaSelection()
    })

    // Highlight toggle button
    document.getElementById('highlight-toggle-btn').addEventListener('click', () => {
      this.toggleHighlightMode()
    })

    // Redact mode buttons
    document.getElementById('redact-mode-word').addEventListener('click', () => {
      this.setRedactMode('word')
    })

    document.getElementById('redact-mode-free').addEventListener('click', () => {
      this.setRedactMode('free')
    })

    // BPM controls
    document.getElementById('bpm-input').addEventListener('input', (e) => {
      this.setBPM(parseInt(e.target.value) || 120)
    })

    document.getElementById('bpm-decrease').addEventListener('click', () => {
      this.setBPM(Math.max(60, this.bpm - 5))
    })

    document.getElementById('bpm-increase').addEventListener('click', () => {
      this.setBPM(Math.min(200, this.bpm + 5))
    })

    // Play/Stop buttons
    document.getElementById('play-btn').addEventListener('click', () => {
      this.play()
    })

    document.getElementById('stop-btn').addEventListener('click', () => {
      this.stop()
    })

    // Listen for text selection (only when highlight mode is enabled)
    let selectionTimeout = null
    document.addEventListener('mouseup', () => {
      if (this.highlightModeEnabled && !this.isSelecting) {
        // Clear any pending timeout
        if (selectionTimeout) {
          clearTimeout(selectionTimeout)
        }
        // Small delay to ensure selection is complete
        selectionTimeout = setTimeout(() => {
          this.handleTextSelection()
          selectionTimeout = null
        }, 50)
      }
    })

    // Listen for selection changes (only when highlight mode is enabled)
    document.addEventListener('selectionchange', () => {
      if (this.highlightModeEnabled && !this.isSelecting) {
        // Don't process immediately on selectionchange, wait for mouseup
        // This prevents processing incomplete selections
      }
    })
  }

  startAreaSelection() {
    this.isSelecting = true
    const btn = document.getElementById('select-area-btn')
    btn.textContent = 'Selecting... (Click and drag)'
    btn.disabled = true

    // Clear any existing text selection
    const selection = window.getSelection()
    if (selection) {
      selection.removeAllRanges()
    }

    // Disable highlight mode during area selection
    const wasHighlightModeEnabled = this.highlightModeEnabled
    this.highlightModeEnabled = false

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
      e.preventDefault() // Prevent text selection
      startX = e.clientX
      startY = e.clientY
      selector.style.left = startX + 'px'
      selector.style.top = startY + 'px'
      selector.style.width = '0px'
      selector.style.height = '0px'
      selector.style.display = 'block'

      const onMouseMove = (e) => {
        e.preventDefault() // Prevent text selection
        const width = Math.abs(e.clientX - startX)
        const height = Math.abs(e.clientY - startY)
        selector.style.left = Math.min(e.clientX, startX) + 'px'
        selector.style.top = Math.min(e.clientY, startY) + 'px'
        selector.style.width = width + 'px'
        selector.style.height = height + 'px'
      }

      const onMouseUp = (e) => {
        e.preventDefault() // Prevent text selection
        const rect = selector.getBoundingClientRect()
        this.selectedArea = {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height
        }

        selector.style.display = 'none'
        this.isSelecting = false
        btn.textContent = 'Select Area'
        btn.disabled = false
        document.getElementById('area-status').textContent = 
          `Area selected: ${Math.round(rect.width)}×${Math.round(rect.height)}px`

        // Restore text selection
        document.body.style.userSelect = ''
        document.body.style.webkitUserSelect = ''

        // Restore highlight mode if it was enabled
        this.highlightModeEnabled = wasHighlightModeEnabled
        if (wasHighlightModeEnabled) {
          const toggleBtn = document.getElementById('highlight-toggle-btn')
          toggleBtn.textContent = 'Disable Redact'
          toggleBtn.classList.add('playing')
        }

        // Create border overlay for selected area
        this.createAreaBorder()
        
        // Extract all text elements from the selected area
        this.extractAllTextElements()

        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp, { once: true })
    }

    document.addEventListener('mousedown', onMouseDown, { once: true })
  }

  toggleHighlightMode() {
    this.highlightModeEnabled = !this.highlightModeEnabled
    const btn = document.getElementById('highlight-toggle-btn')
    
    if (this.highlightModeEnabled) {
      btn.textContent = 'Disable Redact'
      btn.classList.add('playing')
      if (!this.selectedArea) {
        alert('Please select an area first!')
        this.highlightModeEnabled = false
        btn.textContent = 'Enable Redact'
        btn.classList.remove('playing')
        return
      }
    } else {
      btn.textContent = 'Enable Redact'
      btn.classList.remove('playing')
    }
  }

  setRedactMode(mode) {
    this.redactMode = mode
    
    // Update button states
    const wordBtn = document.getElementById('redact-mode-word')
    const freeBtn = document.getElementById('redact-mode-free')
    const status = document.getElementById('redact-mode-status')
    
    if (mode === 'word') {
      wordBtn.classList.add('active')
      freeBtn.classList.remove('active')
      status.textContent = 'Word mode - redacts individual words'
    } else {
      wordBtn.classList.remove('active')
      freeBtn.classList.add('active')
      status.textContent = 'Free mode - redacts any selected text'
    }
  }

  createAreaBorder() {
    // Remove existing border if any
    if (this.areaBorderOverlay) {
      this.areaBorderOverlay.remove()
    }

    if (!this.selectedArea) return

    // Create border overlay
    const border = document.createElement('div')
    border.id = 'area-border-overlay'
    border.className = 'area-border-overlay'
    
    // Store original coordinates relative to viewport
    const updateBorder = () => {
      if (!this.selectedArea) return
      border.style.left = this.selectedArea.x + 'px'
      border.style.top = this.selectedArea.y + 'px'
      border.style.width = this.selectedArea.width + 'px'
      border.style.height = this.selectedArea.height + 'px'
    }
    
    updateBorder()
    document.body.appendChild(border)
    this.areaBorderOverlay = border

    // Update border on scroll (viewport coordinates don't change, but we keep it for safety)
    const updateBorderPosition = () => {
      if (this.areaBorderOverlay && this.selectedArea) {
        updateBorder()
      }
    }

    window.addEventListener('scroll', updateBorderPosition, { passive: true })
    window.addEventListener('resize', updateBorderPosition, { passive: true })
  }

  extractAllTextElements() {
    if (!this.selectedArea) return

    this.allTextElements = []
    
    // Get all elements that intersect with the selected area
    const allElements = document.elementsFromPoint(
      this.selectedArea.x + this.selectedArea.width / 2,
      this.selectedArea.y + this.selectedArea.height / 2
    )

    const textElements = []
    const processedNodes = new Set()

    // Walk through document to find all text nodes in the area
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          if (processedNodes.has(node)) {
            return NodeFilter.FILTER_REJECT
          }
          
          const parent = node.parentElement
          if (!parent) return NodeFilter.FILTER_REJECT
          
          const rect = parent.getBoundingClientRect()
          
          // Check if element is within or overlaps selected area
          const isWithinArea = !(
            rect.right < this.selectedArea.x ||
            rect.left > this.selectedArea.x + this.selectedArea.width ||
            rect.bottom < this.selectedArea.y ||
            rect.top > this.selectedArea.y + this.selectedArea.height
          )
          
          if (isWithinArea && node.nodeValue.trim().length > 0) {
            processedNodes.add(node)
            return NodeFilter.FILTER_ACCEPT
          }
          
          return NodeFilter.FILTER_REJECT
        }
      },
      false
    )

    let node
    while (node = walker.nextNode()) {
      const text = node.nodeValue
      if (!text || text.trim().length === 0) continue

      // Split into words (keeping spaces)
      const parts = text.split(/(\S+)/)
      
      let offset = 0
      parts.forEach(part => {
        if (part.trim().length === 0) {
          offset += part.length
          return
        }
        
        try {
          const wordRange = document.createRange()
          wordRange.setStart(node, offset)
          wordRange.setEnd(node, offset + part.length)
          
          const wordRect = wordRange.getBoundingClientRect()
          if (wordRect.width > 0 && wordRect.height > 0) {
            textElements.push({
              text: part.trim(),
              range: wordRange.cloneRange(),
              element: node.parentElement,
              isRedacted: false
            })
          }
          
          offset += part.length
        } catch (e) {
          // Skip if range creation fails
        }
      })
    }

    // Sort by position (top to bottom, left to right)
    textElements.sort((a, b) => {
      try {
        const rectA = a.range.getBoundingClientRect()
        const rectB = b.range.getBoundingClientRect()
        
        const topDiff = rectA.top - rectB.top
        if (Math.abs(topDiff) > 5) return topDiff
        return rectA.left - rectB.left
      } catch (e) {
        return 0
      }
    })

    // Mark redacted elements and merge adjacent redacted ones
    const mergedElements = []
    let currentRedactedGroup = null
    
    textElements.forEach((textEl, index) => {
      try {
        const textRect = textEl.range.getBoundingClientRect()
        const isRedacted = this.highlightedWords.some(redacted => {
          try {
            const redactedRect = redacted.element.getBoundingClientRect()
            // Check if they overlap significantly
            const overlapX = Math.max(0, Math.min(textRect.right, redactedRect.right) - Math.max(textRect.left, redactedRect.left))
            const overlapY = Math.max(0, Math.min(textRect.bottom, redactedRect.bottom) - Math.max(textRect.top, redactedRect.top))
            const overlapArea = overlapX * overlapY
            const textArea = textRect.width * textRect.height
            return overlapArea > textArea * 0.3 // 30% overlap threshold
          } catch (e) {
            return false
          }
        })
        textEl.isRedacted = isRedacted
        
        // Merge adjacent redacted elements
        if (isRedacted) {
          if (currentRedactedGroup === null) {
            // Start a new group
            currentRedactedGroup = {
              text: textEl.text,
              range: textEl.range.cloneRange(),
              element: textEl.element,
              isRedacted: true,
              startIndex: index,
              elements: [textEl]
            }
          } else {
            // Check if this element is adjacent to the current group
            try {
              const groupRect = currentRedactedGroup.range.getBoundingClientRect()
              const currentRect = textEl.range.getBoundingClientRect()
              
              // Check if they're on the same line and adjacent (within 10px horizontally, 5px vertically)
              const sameLine = Math.abs(groupRect.top - currentRect.top) < 5
              const horizontalGap = Math.min(
                Math.abs(groupRect.right - currentRect.left),
                Math.abs(currentRect.right - groupRect.left)
              )
              const adjacent = sameLine && horizontalGap < 10
              
              if (adjacent) {
                // Merge into current group
                try {
                  // Extend the range to include this element
                  const groupStart = groupRect.left
                  const groupEnd = groupRect.right
                  const currentStart = currentRect.left
                  const currentEnd = currentRect.right
                  
                  if (currentStart < groupStart) {
                    currentRedactedGroup.range.setStart(textEl.range.startContainer, textEl.range.startOffset)
                  }
                  if (currentEnd > groupEnd) {
                    currentRedactedGroup.range.setEnd(textEl.range.endContainer, textEl.range.endOffset)
                  }
                  
                  // Add space if needed
                  if (currentStart > groupEnd) {
                    currentRedactedGroup.text += ' ' + textEl.text
                  } else {
                    currentRedactedGroup.text += textEl.text
                  }
                  
                  currentRedactedGroup.elements.push(textEl)
                } catch (e) {
                  // If range merge fails, just add to group text
                  currentRedactedGroup.text += ' ' + textEl.text
                  currentRedactedGroup.elements.push(textEl)
                }
              } else {
                // Not adjacent, save current group and start new one
                mergedElements.push(currentRedactedGroup)
                currentRedactedGroup = {
                  text: textEl.text,
                  range: textEl.range.cloneRange(),
                  element: textEl.element,
                  isRedacted: true,
                  startIndex: index,
                  elements: [textEl]
                }
              }
            } catch (e) {
              // If comparison fails, save current group and start new one
              if (currentRedactedGroup) {
                mergedElements.push(currentRedactedGroup)
              }
              currentRedactedGroup = {
                text: textEl.text,
                range: textEl.range.cloneRange(),
                element: textEl.element,
                isRedacted: true,
                startIndex: index,
                elements: [textEl]
              }
            }
          }
        } else {
          // Not redacted
          if (currentRedactedGroup !== null) {
            // Save the current group
            mergedElements.push(currentRedactedGroup)
            currentRedactedGroup = null
          }
          // Add non-redacted element
          mergedElements.push(textEl)
        }
      } catch (e) {
        textEl.isRedacted = false
        if (currentRedactedGroup !== null) {
          mergedElements.push(currentRedactedGroup)
          currentRedactedGroup = null
        }
        mergedElements.push(textEl)
      }
    })
    
    // Don't forget the last group
    if (currentRedactedGroup !== null) {
      mergedElements.push(currentRedactedGroup)
    }

    this.allTextElements = mergedElements
  }

  handleTextSelection() {
    if (this.isSelecting || !this.selectedArea || !this.highlightModeEnabled) return

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return

    // Clone the range immediately before it gets invalidated
    let range
    try {
      range = selection.getRangeAt(0).cloneRange()
    } catch (e) {
      return
    }

    const rect = range.getBoundingClientRect()
    
    // Check if selection is valid
    if (rect.width === 0 && rect.height === 0) return

    // Check if selection overlaps with the selected area
    const selectionCenterX = rect.left + rect.width / 2
    const selectionCenterY = rect.top + rect.height / 2
    
    if (
      selectionCenterX >= this.selectedArea.x &&
      selectionCenterY >= this.selectedArea.y &&
      selectionCenterX <= this.selectedArea.x + this.selectedArea.width &&
      selectionCenterY <= this.selectedArea.y + this.selectedArea.height
    ) {
      const text = range.toString().trim()
      if (text && text.length > 0) {
        // Clear selection first to avoid conflicts
        selection.removeAllRanges()
        
        // Use setTimeout to ensure DOM is ready
        setTimeout(() => {
          if (this.redactMode === 'word') {
            // Word mode: redact each word individually
            this.redactWords(range)
          } else {
            // Free mode: redact the entire selection
            try {
              this.addHighlightedWord(text, range)
            } catch (e) {
              console.warn('Error in free mode redaction:', e)
            }
          }
        }, 0)
      }
    }
  }

  redactWords(range) {
    try {
      const text = range.toString().trim()
      if (!text) return
      
      // Split text into words (non-whitespace sequences)
      const words = text.match(/\S+/g) || []
      if (words.length === 0) return
      
      // Get the start container and offset
      const startContainer = range.startContainer
      const startOffset = range.startOffset
      const endContainer = range.endContainer
      const endOffset = range.endOffset
      
      // If both containers are the same text node, it's simple
      if (startContainer === endContainer && startContainer.nodeType === Node.TEXT_NODE) {
        const nodeText = startContainer.nodeValue
        const selectedText = nodeText.substring(startOffset, endOffset)
        const wordsInSelection = selectedText.match(/\S+/g) || []
        
        let currentPos = startOffset
        wordsInSelection.forEach(word => {
          const wordIndex = nodeText.indexOf(word, currentPos)
          if (wordIndex !== -1 && wordIndex < endOffset) {
            try {
              const wordRange = document.createRange()
              wordRange.setStart(startContainer, wordIndex)
              wordRange.setEnd(startContainer, wordIndex + word.length)
              
              if (!this.isAlreadyRedacted(wordRange)) {
                this.addHighlightedWord(word, wordRange)
              }
              currentPos = wordIndex + word.length
            } catch (e) {
              console.warn('Error creating word range:', e)
            }
          }
        })
        return
      }
      
      // For complex ranges spanning multiple nodes, get all text nodes
      const textNodes = []
      const walker = document.createTreeWalker(
        range.commonAncestorContainer,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            return range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
          }
        },
        false
      )
      
      let node
      while (node = walker.nextNode()) {
        textNodes.push(node)
      }
      
      if (textNodes.length === 0) return
      
      // Process each text node and find words
      textNodes.forEach(textNode => {
        const nodeText = textNode.nodeValue
        if (!nodeText || nodeText.trim().length === 0) return
        
        // Determine the valid range within this node
        let nodeStart = 0
        let nodeEnd = nodeText.length
        
        if (textNode === startContainer && startContainer.nodeType === Node.TEXT_NODE) {
          nodeStart = startOffset
        }
        if (textNode === endContainer && endContainer.nodeType === Node.TEXT_NODE) {
          nodeEnd = endOffset
        }
        
        const nodeSubstring = nodeText.substring(nodeStart, nodeEnd)
        const wordsInNode = nodeSubstring.match(/\S+/g) || []
        
        wordsInNode.forEach(word => {
          const wordIndex = nodeText.indexOf(word, nodeStart)
          if (wordIndex !== -1 && wordIndex + word.length <= nodeEnd) {
            try {
              const wordRange = document.createRange()
              wordRange.setStart(textNode, wordIndex)
              wordRange.setEnd(textNode, wordIndex + word.length)
              
              if (!this.isAlreadyRedacted(wordRange)) {
                this.addHighlightedWord(word, wordRange)
              }
            } catch (e) {
              console.warn('Error creating word range:', e)
            }
          }
        })
      })
    } catch (e) {
      console.warn('Could not split selection into words:', e)
      // Fallback to free mode
      try {
        const text = range.toString().trim()
        if (text) {
          this.addHighlightedWord(text, range)
        }
      } catch (e2) {
        console.warn('Fallback also failed:', e2)
      }
    }
  }

  isAlreadyRedacted(range) {
    try {
      const rect = range.getBoundingClientRect()
      return this.highlightedWords.some(w => {
        try {
          const wRect = w.element.getBoundingClientRect()
          const overlapX = Math.max(0, Math.min(rect.right, wRect.right) - Math.max(rect.left, wRect.left))
          const overlapY = Math.max(0, Math.min(rect.bottom, wRect.bottom) - Math.max(rect.top, wRect.top))
          const overlapArea = overlapX * overlapY
          const rectArea = rect.width * rect.height
          return overlapArea > rectArea * 0.3 // 30% overlap threshold
        } catch (e) {
          return false
        }
      })
    } catch (e) {
      return false
    }
  }

  addHighlightedWord(text, range) {
    // Check if already redacted
    if (this.isAlreadyRedacted(range)) return

    // Create highlight
    const span = document.createElement('span')
    span.className = 'highlighted-text'
    span.setAttribute('data-word-index', this.highlightedWords.length)

    try {
      // Check if range is collapsed or invalid
      if (range.collapsed) return
      
      const startContainer = range.startContainer
      const endContainer = range.endContainer
      const startOffset = range.startOffset
      const endOffset = range.endOffset
      
      // Case 1: Range is within a single text node (most common)
      if (startContainer === endContainer && startContainer.nodeType === Node.TEXT_NODE) {
        const textNode = startContainer
        const parentElement = textNode.parentNode
        
        if (!parentElement) return
        
        const beforeText = textNode.nodeValue.substring(0, startOffset)
        const selectedText = textNode.nodeValue.substring(startOffset, endOffset)
        const afterText = textNode.nodeValue.substring(endOffset)
        
        // Create new nodes
        const beforeNode = beforeText ? document.createTextNode(beforeText) : null
        span.textContent = selectedText
        const afterNode = afterText ? document.createTextNode(afterText) : null
        
        // Replace the text node
        if (afterNode) {
          parentElement.replaceChild(afterNode, textNode)
          parentElement.insertBefore(span, afterNode)
        } else {
          parentElement.replaceChild(span, textNode)
        }
        
        if (beforeNode) {
          parentElement.insertBefore(beforeNode, span)
        }
      }
      // Case 2: Try surroundContents (works for simple element selections)
      else {
        try {
          range.surroundContents(span)
        } catch (e) {
          // Case 3: Extract and insert
          try {
            const contents = range.extractContents()
            span.appendChild(contents)
            range.insertNode(span)
          } catch (e2) {
            // Case 4: Manual reconstruction for complex ranges
            try {
              // Get all text nodes in range
              const textNodes = []
              const walker = document.createTreeWalker(
                range.commonAncestorContainer,
                NodeFilter.SHOW_TEXT,
                {
                  acceptNode: (node) => {
                    return range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
                  }
                },
                false
              )
              
              let node
              while (node = walker.nextNode()) {
                textNodes.push(node)
              }
              
              if (textNodes.length === 0) {
                console.warn('No text nodes found in range')
                return
              }
              
              // For the first text node, get text from startOffset
              // For the last text node, get text up to endOffset
              // For middle nodes, get all text
              
              const fragments = []
              textNodes.forEach((textNode, index) => {
                const nodeText = textNode.nodeValue
                let start = 0
                let end = nodeText.length
                
                if (index === 0 && textNode === startContainer) {
                  start = startOffset
                }
                if (index === textNodes.length - 1 && textNode === endContainer) {
                  end = endOffset
                }
                
                if (start < end) {
                  fragments.push(nodeText.substring(start, end))
                }
              })
              
              span.textContent = fragments.join('')
              
              // Insert span at the start position
              if (startContainer.nodeType === Node.TEXT_NODE) {
                const parent = startContainer.parentNode
                const beforeNode = document.createTextNode(startContainer.nodeValue.substring(0, startOffset))
                parent.insertBefore(span, startContainer)
                if (beforeNode.nodeValue) {
                  parent.insertBefore(beforeNode, span)
                }
                startContainer.nodeValue = startContainer.nodeValue.substring(startOffset)
              } else {
                range.insertNode(span)
              }
            } catch (e3) {
              console.warn('Could not highlight text with any method:', e3)
              return
            }
          }
        }
      }
    } catch (e) {
      console.warn('Error in addHighlightedWord:', e)
      return
    }

    // Store the word info
    const wordInfo = {
      text,
      element: span,
      index: this.highlightedWords.length
    }

    this.highlightedWords.push(wordInfo)
    this.updateHighlightStatus()
    
    // Re-extract text elements to update redacted status
    if (this.selectedArea) {
      setTimeout(() => {
        this.extractAllTextElements()
      }, 10)
    }
  }

  updateHighlightStatus() {
    const status = document.getElementById('highlight-status')
    status.textContent = `${this.highlightedWords.length} phrase${this.highlightedWords.length !== 1 ? 's' : ''} redacted`
  }

  setBPM(bpm) {
    this.bpm = Math.max(60, Math.min(200, bpm))
    document.getElementById('bpm-input').value = this.bpm
    
    if (this.isPlaying) {
      this.stop()
      this.play()
    }
  }

  play() {
    if (!this.selectedArea) {
      alert('Please select an area first!')
      return
    }

    // Re-extract text elements to ensure we have the latest
    this.extractAllTextElements()

    if (this.allTextElements.length === 0) {
      alert('No text found in the selected area!')
      return
    }

    this.isPlaying = true
    this.currentStep = 0

    document.getElementById('play-btn').disabled = true
    document.getElementById('play-btn').classList.add('playing')
    document.getElementById('stop-btn').disabled = false

    // Calculate step duration in milliseconds (16th notes)
    const stepDuration = (60 / this.bpm) * 1000 / 4

    this.stepInterval = setInterval(() => {
      this.playStep()
      this.currentStep = (this.currentStep + 1) % this.allTextElements.length
    }, stepDuration)
    
    // Play first step immediately
    this.playStep()
  }

  playStep() {
    if (this.allTextElements.length === 0) return

    const textIndex = this.currentStep % this.allTextElements.length
    const textEl = this.allTextElements[textIndex]

    // Remove previous border
    if (this.currentTextBorder) {
      this.currentTextBorder.remove()
      this.currentTextBorder = null
    }

    // Create green border around current text
    try {
      const rect = textEl.range.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        // Remove old border
        if (this.currentTextBorder) {
          this.currentTextBorder.remove()
        }
        
        const border = document.createElement('div')
        border.className = 'current-text-border'
        border.style.position = 'fixed'
        border.style.left = rect.left + 'px'
        border.style.top = rect.top + 'px'
        border.style.width = rect.width + 'px'
        border.style.height = rect.height + 'px'
        
        document.body.appendChild(border)
        this.currentTextBorder = border

        // Scroll into view if needed
        const element = textEl.element
        if (element && element.scrollIntoView) {
          element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
        }
      }
    } catch (e) {
      console.warn('Could not create border for text:', e)
    }

    // If this text is redacted, play sound
    if (textEl.isRedacted) {
      // Find which redacted word this corresponds to
      const redactedIndex = this.highlightedWords.findIndex(redacted => {
        const redactedRect = redacted.element.getBoundingClientRect()
        const textRect = textEl.range.getBoundingClientRect()
        // Check if they overlap
        return !(
          textRect.right < redactedRect.left ||
          textRect.left > redactedRect.right ||
          textRect.bottom < redactedRect.top ||
          textRect.top > redactedRect.bottom
        )
      })
      
      if (redactedIndex >= 0) {
        this.playDrumSound(redactedIndex)
      }
    }
  }

  stop() {
    this.isPlaying = false
    this.currentStep = 0

    if (this.stepInterval) {
      clearInterval(this.stepInterval)
      this.stepInterval = null
    }

    document.getElementById('play-btn').disabled = false
    document.getElementById('play-btn').classList.remove('playing')
    document.getElementById('stop-btn').disabled = true

    // Remove green border
    if (this.currentTextBorder) {
      this.currentTextBorder.remove()
      this.currentTextBorder = null
    }

    // Remove active class from all highlights
    this.highlightedWords.forEach(word => {
      word.element.classList.remove('active')
    })
  }
}

// Initialize drum machine when content script loads
let drumMachine = null

function initDrumMachine() {
  if (!drumMachine) {
    drumMachine = new DrumMachine()
  }
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDrumMachine)
} else {
  initDrumMachine()
}
