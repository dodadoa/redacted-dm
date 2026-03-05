export class TextHighlighter {
  constructor(onHighlightChange) {
    this.highlightedWords = []
    this.redactMode = 'free' // 'word' or 'free'
    this.onHighlightChange = onHighlightChange
  }

  setRedactMode(mode) {
    this.redactMode = mode
  }

  getRedactMode() {
    return this.redactMode
  }

  /** Redact the word at viewport position (x, y) if inside a selected area. Returns true if redacted. */
  redactWordAtPoint(clientX, clientY, selectedAreas) {
    if (selectedAreas.length === 0) return false

    const inArea = selectedAreas.some(a => {
      const anchor = a.anchorElement || document.body
      const r = anchor.getBoundingClientRect()
      const left = r.left + a.x
      const top = r.top + a.y
      return clientX >= left && clientX <= left + a.width && clientY >= top && clientY <= top + a.height
    })
    if (!inArea) return false

    let textNode, offset
    if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(clientX, clientY)
      if (!range) return false
      textNode = range.startContainer
      offset = range.startOffset
    } else if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(clientX, clientY)
      if (!pos) return false
      textNode = pos.offsetNode
      offset = pos.offset
    } else {
      return false
    }
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return false

    const text = textNode.nodeValue
    let wordStart = offset
    while (wordStart > 0 && /\S/.test(text[wordStart - 1])) wordStart--
    let wordEnd = offset
    while (wordEnd < text.length && /\S/.test(text[wordEnd])) wordEnd++
    if (wordStart >= wordEnd) return false

    const wordText = text.substring(wordStart, wordEnd)
    const wordRange = document.createRange()
    wordRange.setStart(textNode, wordStart)
    wordRange.setEnd(textNode, wordEnd)

    if (this.isAlreadyRedacted(wordRange)) return false

    this.addHighlightedWord(wordText, wordRange)
    return true
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

    // Cross-block ranges (spanning two paragraphs) can produce a zero
    // getBoundingClientRect() in Chrome, so we use getClientRects() which
    // returns one rect per visible line box and is always reliable.
    const clientRects = Array.from(range.getClientRects()).filter(r => r.width > 0 && r.height > 0)
    if (clientRects.length === 0) return

    // The selection is "in" an area when at least one of its line rects has
    // its centre inside that area — important for cross-line selections where
    // the bounding-rect centre would be in the gap between two lines.
    const isInAnyArea = selectedAreas.some(selectedArea => {
      const anchorRect = selectedArea.anchorElement.getBoundingClientRect()
      return clientRects.some(lineRect => {
        const relativeX = lineRect.left + lineRect.width  / 2 - anchorRect.left
        const relativeY = lineRect.top  + lineRect.height / 2 - anchorRect.top
        return (
          relativeX >= selectedArea.x &&
          relativeY >= selectedArea.y &&
          relativeX <= selectedArea.x + selectedArea.width &&
          relativeY <= selectedArea.y + selectedArea.height
        )
      })
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
          // Check each segment individually to avoid false positives from multi-line
          // bounding rects that would cover the entire area between two wrapped lines.
          const segments = w.segments ?? [w.element]
          return segments.some(el => {
            try {
              const elRect = el.getBoundingClientRect()
              const overlapX = Math.max(0, Math.min(rect.right, elRect.right) - Math.max(rect.left, elRect.left))
              const overlapY = Math.max(0, Math.min(rect.bottom, elRect.bottom) - Math.max(rect.top, elRect.top))
              return overlapX * overlapY > rect.width * rect.height * 0.3
            } catch {
              return false
            }
          })
        } catch {
          return false
        }
      })
    } catch {
      return false
    }
  }

  addHighlightedWord(text, range) {
    if (this.isAlreadyRedacted(range)) return
    if (range.collapsed) return

    const wordIndex = this.highlightedWords.length

    try {
      const startContainer = range.startContainer
      const endContainer   = range.endContainer
      const startOffset    = range.startOffset
      const endOffset      = range.endOffset

      let segments = []

      // Case 1: range is within a single text node (most common)
      if (startContainer === endContainer && startContainer.nodeType === Node.TEXT_NODE) {
        const span = document.createElement('span')
        span.className = 'highlighted-text'
        span.setAttribute('data-word-index', wordIndex)

        const parent = startContainer.parentNode
        if (!parent) return

        const nodeValue    = startContainer.nodeValue
        const beforeNode   = nodeValue.substring(0, startOffset) ? document.createTextNode(nodeValue.substring(0, startOffset)) : null
        span.textContent   = nodeValue.substring(startOffset, endOffset)
        const afterNode    = nodeValue.substring(endOffset)      ? document.createTextNode(nodeValue.substring(endOffset))      : null

        if (afterNode) {
          parent.replaceChild(afterNode, startContainer)
          parent.insertBefore(span, afterNode)
        } else {
          parent.replaceChild(span, startContainer)
        }
        if (beforeNode) parent.insertBefore(beforeNode, span)

        segments = [span]
      } else {
        // Multi-node range (cross-line / cross-element): wrap each text node
        // individually to avoid DOM corruption from extractContents().
        segments = this._wrapMultiNodeRange(range, wordIndex)

        if (segments.length === 0) {
          // Last-resort: try surroundContents for degenerate edge cases
          try {
            const span = document.createElement('span')
            span.className = 'highlighted-text'
            span.setAttribute('data-word-index', wordIndex)
            range.surroundContents(span)
            segments = [span]
          } catch (e) {
            console.warn('Could not highlight text:', e)
            return
          }
        }
      }

      this.highlightedWords.push({ text, element: segments[0], segments, index: wordIndex })
      this.updateHighlightStatus()
      if (this.onHighlightChange) this.onHighlightChange()
    } catch (e) {
      console.warn('Error in addHighlightedWord:', e)
    }
  }

  /**
   * Wrap each text node intersecting `range` with its own `.highlighted-text` span,
   * using the same safe in-place substitution as Case 1. Returns all created spans.
   * Collecting nodes before mutation avoids TreeWalker invalidation mid-traversal.
   */
  _wrapMultiNodeRange(range, wordIndex) {
    const segments = []
    if (range.commonAncestorContainer.nodeType === Node.TEXT_NODE) return segments

    const walker = document.createTreeWalker(
      range.commonAncestorContainer,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          try {
            return range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
          } catch {
            return NodeFilter.FILTER_REJECT
          }
        },
      },
      false
    )

    // Collect first so DOM mutations during wrapping don't confuse the walker
    const textNodes = []
    let node
    while ((node = walker.nextNode())) textNodes.push(node)

    for (const textNode of textNodes) {
      const text = textNode.nodeValue
      if (!text || text.trim().length === 0) continue

      let start = 0
      let end   = text.length
      if (textNode === range.startContainer) start = range.startOffset
      if (textNode === range.endContainer)   end   = range.endOffset
      if (start >= end) continue

      const selectedText = text.substring(start, end)
      if (!selectedText.trim()) continue

      const span = document.createElement('span')
      span.className = 'highlighted-text'
      span.setAttribute('data-word-index', wordIndex)

      const parent = textNode.parentNode
      if (!parent) continue

      const beforeNode = text.substring(0, start) ? document.createTextNode(text.substring(0, start)) : null
      span.textContent = selectedText
      const afterNode  = text.substring(end)      ? document.createTextNode(text.substring(end))      : null

      if (afterNode) {
        parent.replaceChild(afterNode, textNode)
        parent.insertBefore(span, afterNode)
      } else {
        parent.replaceChild(span, textNode)
      }
      if (beforeNode) parent.insertBefore(beforeNode, span)

      segments.push(span)
    }

    return segments
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

  undoLastRedaction() {
    if (this.highlightedWords.length === 0) return
    const last = this.highlightedWords.pop()
    const segments = last.segments ?? [last.element]
    segments.forEach(segment => {
      if (segment && segment.parentNode) {
        const parent = segment.parentNode
        parent.replaceChild(document.createTextNode(segment.textContent), segment)
        parent.normalize()
      }
    })
    this.updateHighlightStatus()
    if (this.onHighlightChange) this.onHighlightChange()
  }

  clearHighlights() {
    this.highlightedWords.forEach(word => {
      const segments = word.segments ?? [word.element]
      segments.forEach(segment => {
        if (segment && segment.parentNode) {
          const parent = segment.parentNode
          parent.replaceChild(document.createTextNode(segment.textContent), segment)
          parent.normalize()
        }
      })
    })
    this.highlightedWords = []
    this.updateHighlightStatus()
  }
}

