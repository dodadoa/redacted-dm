export class TextExtractor {
  constructor() {
    this.allTextElements = []
  }

  extractAllTextElements(selectedAreas, highlightedWords) {
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

    // Mark redacted elements and merge adjacent redacted ones
    const mergedElements = []
    let currentRedactedGroup = null
    
    textElements.forEach((textEl, index) => {
      try {
        const textRect = textEl.range.getBoundingClientRect()
        const isRedacted = highlightedWords.some(redacted => {
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
    return mergedElements
  }

  getAllTextElements() {
    return this.allTextElements
  }
}

