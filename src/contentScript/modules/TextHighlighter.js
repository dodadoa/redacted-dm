const HIGHLIGHT_CLASS = 'highlighted-text'
const OVERLAP_THRESHOLD = 0.3

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
    if (!this._pointInArea(clientX, clientY, selectedAreas)) return false

    const caret = this._caretFromPoint(clientX, clientY)
    if (!caret) return false

    const { textNode, offset } = caret
    const { start, end } = this._wordBoundaries(textNode.nodeValue, offset)
    if (start >= end) return false

    const wordText = textNode.nodeValue.substring(start, end)
    const wordRange = document.createRange()
    wordRange.setStart(textNode, start)
    wordRange.setEnd(textNode, end)

    if (this.isAlreadyRedacted(wordRange)) return false

    this.addHighlightedWord(wordText, wordRange)
    return true
  }

  handleTextSelection(selectedAreas) {
    if (selectedAreas.length === 0) return

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return

    let range
    try {
      range = selection.getRangeAt(0).cloneRange()
    } catch {
      return
    }

    if (!this._selectionInArea(range, selectedAreas)) return

    const text = range.toString().trim()
    if (!text) return

    selection.removeAllRanges()
    setTimeout(() => {
      if (this.redactMode === 'word') {
        this.redactWords(range)
      } else {
        try {
          this.addHighlightedWord(text, range)
        } catch (e) {
          console.warn('Error in free mode redaction:', e)
        }
      }
    }, 0)
  }

  redactWords(range) {
    try {
      const text = range.toString().trim()
      if (!text) return

      const startContainer = range.startContainer
      const endContainer = range.endContainer
      const startOffset = range.startOffset
      const endOffset = range.endOffset

      if (startContainer === endContainer && startContainer.nodeType === Node.TEXT_NODE) {
        this._redactWordsInSingleNode(startContainer, startOffset, endOffset)
        return
      }

      this._redactWordsInMultiNode(range)
    } catch (e) {
      console.warn('Could not split selection into words:', e)
      const fallbackText = range.toString().trim()
      if (fallbackText) this.addHighlightedWord(fallbackText, range)
    }
  }

  isAlreadyRedacted(range) {
    try {
      const rangeRect = range.getBoundingClientRect()
      return this.highlightedWords.some(word => this._highlightOverlapsRange(word, rangeRect))
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
      const endContainer = range.endContainer
      const startOffset = range.startOffset
      const endOffset = range.endOffset

      let segments

      if (startContainer === endContainer && startContainer.nodeType === Node.TEXT_NODE) {
        segments = this._wrapSingleTextNode(startContainer, startOffset, endOffset, wordIndex)
      } else {
        segments = this._wrapMultiNodeRange(range, wordIndex)
        if (segments.length === 0) {
          try {
            const span = document.createElement('span')
            span.className = HIGHLIGHT_CLASS
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
      this.onHighlightChange?.()
    } catch (e) {
      console.warn('Error in addHighlightedWord:', e)
    }
  }

  updateHighlightStatus() {
    const status = document.getElementById('highlight-status')
    if (status) {
      const count = this.highlightedWords.length
      status.textContent = `${count} phrase${count !== 1 ? 's' : ''} redacted`
    }
  }

  getHighlightedWords() {
    return this.highlightedWords
  }

  undoLastRedaction() {
    if (this.highlightedWords.length === 0) return
    const last = this.highlightedWords.pop()
    this._restoreSegments(last.segments ?? [last.element])
    this.updateHighlightStatus()
    this.onHighlightChange?.()
  }

  clearHighlights() {
    this.highlightedWords.forEach(word => {
      this._restoreSegments(word.segments ?? [word.element])
    })
    this.highlightedWords = []
    this.updateHighlightStatus()
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  _pointInArea(clientX, clientY, selectedAreas) {
    return selectedAreas.some(area => {
      const anchor = area.anchorElement ?? document.body
      const rect = anchor.getBoundingClientRect()
      const left = rect.left + area.x
      const top = rect.top + area.y
      return (
        clientX >= left &&
        clientX <= left + area.width &&
        clientY >= top &&
        clientY <= top + area.height
      )
    })
  }

  _caretFromPoint(clientX, clientY) {
    if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(clientX, clientY)
      if (!range) return null
      const node = range.startContainer
      if (node?.nodeType !== Node.TEXT_NODE) return null
      return { textNode: node, offset: range.startOffset }
    }
    if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(clientX, clientY)
      if (!pos) return null
      const node = pos.offsetNode
      if (node?.nodeType !== Node.TEXT_NODE) return null
      return { textNode: node, offset: pos.offset }
    }
    return null
  }

  _wordBoundaries(text, offset) {
    let start = offset
    while (start > 0 && /\S/.test(text[start - 1])) start--
    let end = offset
    while (end < text.length && /\S/.test(text[end])) end++
    return { start, end }
  }

  _selectionInArea(range, selectedAreas) {
    const clientRects = Array.from(range.getClientRects()).filter(
      rect => rect.width > 0 && rect.height > 0
    )
    if (clientRects.length === 0) return false

    return selectedAreas.some(area => {
      const anchor = area.anchorElement ?? document.body
      const anchorRect = anchor.getBoundingClientRect()
      // Require ALL rects to be inside the area so redaction doesn't exceed selection bounds
      return clientRects.every(lineRect => {
        const relativeX = lineRect.left + lineRect.width / 2 - anchorRect.left
        const relativeY = lineRect.top + lineRect.height / 2 - anchorRect.top
        return (
          relativeX >= area.x &&
          relativeY >= area.y &&
          relativeX <= area.x + area.width &&
          relativeY <= area.y + area.height
        )
      })
    })
  }

  _redactWordsInSingleNode(textNode, startOffset, endOffset) {
    const nodeText = textNode.nodeValue
    const selectedText = nodeText.substring(startOffset, endOffset)
    const words = selectedText.match(/\S+/g) ?? []
    let currentPos = startOffset

    for (const word of words) {
      const wordIndex = nodeText.indexOf(word, currentPos)
      if (wordIndex === -1 || wordIndex >= endOffset) continue
      try {
        const wordRange = document.createRange()
        wordRange.setStart(textNode, wordIndex)
        wordRange.setEnd(textNode, wordIndex + word.length)
        if (!this.isAlreadyRedacted(wordRange)) {
          this.addHighlightedWord(word, wordRange)
        }
        currentPos = wordIndex + word.length
      } catch (e) {
        console.warn('Error creating word range:', e)
      }
    }
  }

  _redactWordsInMultiNode(range) {
    const textNodes = this._collectTextNodesInRange(range)
    const startContainer = range.startContainer
    const endContainer = range.endContainer
    const startOffset = range.startOffset
    const endOffset = range.endOffset

    for (const textNode of textNodes) {
      const nodeText = textNode.nodeValue
      if (!nodeText?.trim()) continue

      let nodeStart = 0
      let nodeEnd = nodeText.length
      if (textNode === startContainer && startContainer.nodeType === Node.TEXT_NODE) {
        nodeStart = startOffset
      }
      if (textNode === endContainer && endContainer.nodeType === Node.TEXT_NODE) {
        nodeEnd = endOffset
      }

      const nodeSubstring = nodeText.substring(nodeStart, nodeEnd)
      const words = nodeSubstring.match(/\S+/g) ?? []

      for (const word of words) {
        const wordIndex = nodeText.indexOf(word, nodeStart)
        if (wordIndex === -1 || wordIndex + word.length > nodeEnd) continue
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
    }
  }

  _collectTextNodesInRange(range) {
    const textNodes = []
    const walker = document.createTreeWalker(
      range.commonAncestorContainer,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: node => {
          try {
            return range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
          } catch {
            return NodeFilter.FILTER_REJECT
          }
        },
      },
      false
    )
    let node
    while ((node = walker.nextNode())) textNodes.push(node)
    return textNodes
  }

  _highlightOverlapsRange(word, rangeRect) {
    try {
      const segments = word.segments ?? [word.element]
      return segments.some(element => {
        try {
          // Use getClientRects() so a single span wrapping two lines doesn't block
          // new redactions on the second line — one rect per line box, not one huge bbox.
          let rects = Array.from(element.getClientRects?.() ?? []).filter(r => r.width > 0 && r.height > 0)
          if (rects.length === 0) {
            const fallback = element.getBoundingClientRect()
            if (fallback.width > 0 && fallback.height > 0) rects = [fallback]
          }
          return rects.some(elementRect =>
            this._rectOverlapExceedsThreshold(rangeRect, elementRect)
          )
        } catch {
          return false
        }
      })
    } catch {
      return false
    }
  }

  _rectOverlapExceedsThreshold(rangeRect, elementRect) {
    const overlapX = Math.max(
      0,
      Math.min(rangeRect.right, elementRect.right) - Math.max(rangeRect.left, elementRect.left)
    )
    const overlapY = Math.max(
      0,
      Math.min(rangeRect.bottom, elementRect.bottom) - Math.max(rangeRect.top, elementRect.top)
    )
    const threshold = rangeRect.width * rangeRect.height * OVERLAP_THRESHOLD
    return overlapX * overlapY > threshold
  }

  _wrapSingleTextNode(textNode, startOffset, endOffset, wordIndex) {
    const parent = textNode.parentNode
    if (!parent) return []

    const nodeValue = textNode.nodeValue
    const beforeText = nodeValue.substring(0, startOffset)
    const selectedText = nodeValue.substring(startOffset, endOffset)
    const afterText = nodeValue.substring(endOffset)

    const span = document.createElement('span')
    span.className = HIGHLIGHT_CLASS
    span.setAttribute('data-word-index', wordIndex)
    span.textContent = selectedText

    const afterNode = afterText ? document.createTextNode(afterText) : null
    if (afterNode) {
      parent.replaceChild(afterNode, textNode)
      parent.insertBefore(span, afterNode)
    } else {
      parent.replaceChild(span, textNode)
    }
    if (beforeText) parent.insertBefore(document.createTextNode(beforeText), span)
    return [span]
  }

  _wrapMultiNodeRange(range, wordIndex) {
    if (range.commonAncestorContainer.nodeType === Node.TEXT_NODE) return []

    const textNodes = this._collectTextNodesInRange(range)
    const segments = []

    for (const textNode of textNodes) {
      const text = textNode.nodeValue
      if (!text?.trim()) continue

      // Skip text nodes already inside a highlighted span — they have their own redaction
      if (textNode.parentElement?.classList.contains(HIGHLIGHT_CLASS)) continue

      let start = 0
      let end = text.length
      if (textNode === range.startContainer) start = range.startOffset
      if (textNode === range.endContainer) end = range.endOffset
      if (start >= end) continue

      const selectedText = text.substring(start, end)
      if (!selectedText.trim()) continue

      const span = document.createElement('span')
      span.className = HIGHLIGHT_CLASS
      span.setAttribute('data-word-index', wordIndex)
      span.textContent = selectedText

      const parent = textNode.parentNode
      if (!parent) continue

      const beforeNode = text.substring(0, start) ? document.createTextNode(text.substring(0, start)) : null
      const afterNode = text.substring(end) ? document.createTextNode(text.substring(end)) : null

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

  _restoreSegments(segments) {
    for (const segment of segments) {
      if (segment?.parentNode) {
        const parent = segment.parentNode
        parent.replaceChild(document.createTextNode(segment.textContent), segment)
        parent.normalize()
      }
    }
  }

}
