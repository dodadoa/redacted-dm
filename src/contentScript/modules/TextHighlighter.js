export class TextHighlighter {
  constructor(onHighlightChange) {
    this.highlightedWords = []
    this.redactMode = 'free' // 'word' or 'free'
    this.onHighlightChange = onHighlightChange
  }

  setRedactMode(mode) {
    this.redactMode = mode
    
    // Update button states
    const wordBtn = document.getElementById('redact-mode-word')
    const freeBtn = document.getElementById('redact-mode-free')
    const status = document.getElementById('redact-mode-status')
    
    if (mode === 'word') {
      if (wordBtn) wordBtn.classList.add('active')
      if (freeBtn) freeBtn.classList.remove('active')
      if (status) status.textContent = 'Word mode - redacts individual words'
    } else {
      if (wordBtn) wordBtn.classList.remove('active')
      if (freeBtn) freeBtn.classList.add('active')
      if (status) status.textContent = 'Free mode - redacts any selected text'
    }
  }

  handleTextSelection(selectedAreas) {
    if (selectedAreas.length === 0) return

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

    // Check if selection overlaps with any of the selected areas
    const selectionCenterX = rect.left + rect.width / 2
    const selectionCenterY = rect.top + rect.height / 2
    
    const isInAnyArea = selectedAreas.some(selectedArea => {
      const anchorRect = selectedArea.anchorElement.getBoundingClientRect()
      // Convert viewport coordinates to relative coordinates
      const relativeX = selectionCenterX - anchorRect.left
      const relativeY = selectionCenterY - anchorRect.top
      
      return (
        relativeX >= selectedArea.x &&
        relativeY >= selectedArea.y &&
        relativeX <= selectedArea.x + selectedArea.width &&
        relativeY <= selectedArea.y + selectedArea.height
      )
    })
    
    if (isInAnyArea) {
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
    
    // Notify callback
    if (this.onHighlightChange) {
      this.onHighlightChange()
    }
  }

  updateHighlightStatus() {
    const status = document.getElementById('highlight-status')
    if (status) {
      status.textContent = `${this.highlightedWords.length} phrase${this.highlightedWords.length !== 1 ? 's' : ''} redacted`
    }
  }

  getHighlightedWords() {
    return this.highlightedWords
  }

  clearHighlights() {
    this.highlightedWords.forEach(word => {
      if (word.element && word.element.parentNode) {
        const parent = word.element.parentNode
        const textNode = document.createTextNode(word.text)
        parent.replaceChild(textNode, word.element)
        parent.normalize()
      }
    })
    this.highlightedWords = []
    this.updateHighlightStatus()
  }
}

