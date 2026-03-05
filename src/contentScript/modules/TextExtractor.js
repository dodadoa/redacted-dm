export class TextExtractor {
  constructor() {
    this.allTextElements = []
  }

  extractAllTextElements(selectedAreas, highlightedWords, redactMode = 'word') {
    if (selectedAreas.length === 0) {
      this.allTextElements = []
      return []
    }

    const textElements = []
    const processedNodes = new Set()

    // Process each selected area
    selectedAreas.forEach(selectedArea => {
      // Walk through document to find all text nodes in this area
      const walker = document.createTreeWalker(
        selectedArea.anchorElement || document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            if (processedNodes.has(node)) {
              return NodeFilter.FILTER_REJECT
            }
            
            const parent = node.parentElement
            if (!parent) return NodeFilter.FILTER_REJECT
            
            // Exclude area UI (instrument pill, header, border) — they should not be sequencer beats
            if (parent.closest?.('.area-instrument-pill, .area-selector-header, .area-border-overlay, .drum-machine-overlay')) {
              return NodeFilter.FILTER_REJECT
            }
            
            // Get position relative to anchor element
            const anchorRect = selectedArea.anchorElement.getBoundingClientRect()
            const parentRect = parent.getBoundingClientRect()
            
            // Calculate relative position (viewport coordinates to relative)
            const relativeLeft = parentRect.left - anchorRect.left
            const relativeTop = parentRect.top - anchorRect.top
            
            // Check if element is within or overlaps selected area
            const isWithinArea = !(
              (relativeLeft + parentRect.width) < selectedArea.x ||
              relativeLeft > (selectedArea.x + selectedArea.width) ||
              (relativeTop + parentRect.height) < selectedArea.y ||
              relativeTop > (selectedArea.y + selectedArea.height)
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
              // Check if word is within any of the selected areas
              const anchorRect = selectedArea.anchorElement.getBoundingClientRect()
              const wordRelativeLeft = wordRect.left - anchorRect.left
              const wordRelativeTop = wordRect.top - anchorRect.top
              const wordCenterX = wordRelativeLeft + wordRect.width / 2
              const wordCenterY = wordRelativeTop + wordRect.height / 2
              
              // Check if word center is within this selected area
              const isWithinArea = (
                wordCenterX >= selectedArea.x &&
                wordCenterY >= selectedArea.y &&
                wordCenterX <= selectedArea.x + selectedArea.width &&
                wordCenterY <= selectedArea.y + selectedArea.height
              )
              
              // Also check if at least part of the word overlaps with the area
              const overlapsArea = !(
                (wordRelativeLeft + wordRect.width) < selectedArea.x ||
                wordRelativeLeft > (selectedArea.x + selectedArea.width) ||
                (wordRelativeTop + wordRect.height) < selectedArea.y ||
                wordRelativeTop > (selectedArea.y + selectedArea.height)
              )
              
              // Exclude area UI (instrument pill, header, etc.)
              const parentEl = node.parentElement
              if (parentEl?.closest?.('.area-instrument-pill, .area-selector-header, .area-border-overlay, .drum-machine-overlay')) {
                offset += part.length
                return
              }
              
              // Only include if word is within or significantly overlaps the area
              if (isWithinArea || (overlapsArea && wordRect.width > 0 && wordRect.height > 0)) {
                textElements.push({
                  text: part.trim(),
                  range: wordRange.cloneRange(),
                  element: node.parentElement,
                  isRedacted: false
                })
              }
            }
            
            offset += part.length
          } catch (e) {
            // Skip if range creation fails
          }
        })
      }
    })

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

    // Mark redacted elements. In 'free' mode, merge all words in same phrase into one beat (even if word redactions are between them).
    const resultElements = []
    const outputPhrases = new Set() // track which free phrases we've already output

    textElements.forEach((textEl, index) => {
      try {
        const textRect = textEl.range.getBoundingClientRect()
        const matches = []
        highlightedWords.forEach(redacted => {
          try {
            let matchesEl = false
            if (redacted.element.contains(textEl.element) || textEl.element === redacted.element) {
              matchesEl = true
            } else {
              const redactedRect = redacted.element.getBoundingClientRect()
              const overlapX = Math.max(0, Math.min(textRect.right, redactedRect.right) - Math.max(textRect.left, redactedRect.left))
              const overlapY = Math.max(0, Math.min(textRect.bottom, redactedRect.bottom) - Math.max(textRect.top, redactedRect.top))
              const overlapArea = overlapX * overlapY
              const textArea = textRect.width * textRect.height
              if (overlapArea > textArea * 0.3) matchesEl = true
            }
            if (matchesEl) matches.push(redacted)
          } catch (e) {}
        })
        // Prefer outermost match: when word span is nested inside free span, use free so phrase stays grouped
        let matchedRedacted = null
        if (matches.length > 0) {
          matchedRedacted = matches.find(r => !matches.some(other => other !== r && other.element.contains(r.element)))
            || matches[0]
        }
        textEl.isRedacted = matches.length > 0
        textEl.matchedRedacted = matchedRedacted
      } catch (e) {
        textEl.isRedacted = false
        textEl.matchedRedacted = null
      }
    })

    // Group by redacted phrase. Merge only when a phrase has multiple words (free redaction = one span, multiple words).
    const phraseGroups = new Map()
    textElements.forEach((textEl) => {
      if (textEl.isRedacted && textEl.matchedRedacted) {
        const key = textEl.matchedRedacted
        if (!phraseGroups.has(key)) {
          phraseGroups.set(key, [])
        }
        phraseGroups.get(key).push(textEl)
      }
    })

    // Output in document order. Multi-word groups = one merged beat; single-word = one beat.
    textElements.forEach((textEl) => {
      if (!textEl.isRedacted) {
        resultElements.push(textEl)
        return
      }
      const phrase = textEl.matchedRedacted
      if (!phrase || outputPhrases.has(phrase)) return
      outputPhrases.add(phrase)

      const groupEls = phraseGroups.get(phrase) || [textEl]
      if (groupEls.length === 1) {
        resultElements.push(textEl)
        return
      }
      // Multi-word phrase: merge into one beat
      const first = groupEls[0]
      const last = groupEls[groupEls.length - 1]
      const merged = {
        text: groupEls.map(e => e.text).join(' '),
        range: first.range.cloneRange(),
        element: first.element?.closest?.('.highlighted-text') || first.element,
        isRedacted: true,
      }
      try {
        merged.range.setEnd(last.range.endContainer, last.range.endOffset)
      } catch (e) {
        merged.text = groupEls.map(e => e.text).join(' ')
      }
      resultElements.push(merged)
    })

    this.allTextElements = resultElements
    return resultElements
  }

  getAllTextElements() {
    return this.allTextElements
  }
}

