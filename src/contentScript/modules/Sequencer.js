export class Sequencer {
  constructor(audioEngine) {
    this.audioEngine = audioEngine
    this.isPlaying = false
    this.currentStep = 0
    this.areaSteps = []
    this.areaTextElements = []
    this.bpm = 120
    this.speedMultiplier = 1
    this.stepInterval = null
    this.currentTextBorders = []
    this.triggeredElements = []
    // Pending refresh applied area-by-area at the start of each new cycle
    this.pendingRefresh = null
    this._pendingRefreshApplied = 0
    // Saved args so we can restart the interval when speed/bpm changes mid-play
    this._lastPlayArgs = null
  }

  /**
   * Get valid rects for a text element. Cross-block ranges can return empty
   * from getClientRects() in Chrome — fall back to segment/element rects.
   */
  _getRectsForElement(textEl) {
    const fromRange = Array.from(textEl.range.getClientRects?.() ?? []).filter(
      r => r.width > 0 && r.height > 0
    )
    if (fromRange.length > 0) return fromRange

    const bbox = textEl.range.getBoundingClientRect?.()
    if (bbox && bbox.width > 0 && bbox.height > 0) return [bbox]

    const segments = textEl.segments ?? (textEl.element ? [textEl.element] : [])
    const rects = []
    for (const el of segments) {
      try {
        const list = el.getClientRects?.()
        let added = 0
        if (list) {
          for (let i = 0; i < list.length; i++) {
            const r = list[i]
            if (r.width > 0 && r.height > 0) {
              rects.push(r)
              added++
            }
          }
        }
        if (added === 0) {
          const r = el.getBoundingClientRect?.()
          if (r && r.width > 0 && r.height > 0) rects.push(r)
        }
      } catch {}
    }
    return rects
  }

  // Filter allTextElements down to those whose center falls inside selectedArea.
  _filterElementsForArea(allTextElements, selectedArea) {
    const anchor = selectedArea.anchorElement ?? document.body
    const anchorRect = anchor.getBoundingClientRect()

    return allTextElements.filter(textEl => {
      try {
        const lineRects = this._getRectsForElement(textEl)
        if (lineRects.length === 0) return false

        return lineRects.some(r => {
          const relativeX = (r.left + r.width / 2) - anchorRect.left
          const relativeY = (r.top + r.height / 2) - anchorRect.top
          return (
            relativeX >= selectedArea.x &&
            relativeY >= selectedArea.y &&
            relativeX <= selectedArea.x + selectedArea.width &&
            relativeY <= selectedArea.y + selectedArea.height
          )
        })
      } catch (e) {
        return false
      }
    })
  }

  /**
   * Called while playing whenever the user adds/removes a redacted phrase.
   * The new element list will be swapped in per-area at the start of its next cycle.
   */
  scheduleRefresh(allTextElements, highlightedWords) {
    this.pendingRefresh = { allTextElements, highlightedWords }
  }

  play(selectedAreas, allTextElements, highlightedWords) {
    if (selectedAreas.length === 0) {
      alert('Please select at least one area first!')
      return
    }

    this.pendingRefresh = null
    this._pendingRefreshApplied = 0
    this._lastPlayArgs = { selectedAreas, allTextElements, highlightedWords }

    // Separate text elements by area
    this.areaTextElements = []
    this.areaSteps = []
    
    selectedAreas.forEach((selectedArea) => {
      this.areaTextElements.push(this._filterElementsForArea(allTextElements, selectedArea))
      this.areaSteps.push(0)
    })

    // Check if any area has text
    const hasText = this.areaTextElements.some(elements => elements.length > 0)
    if (!hasText) {
      alert('No text found in the selected areas! Please select areas with text.')
      return
    }

    this.isPlaying = true
    this.currentStep = 0

    // Calculate step duration in milliseconds (16th notes) using effective BPM
    const stepDuration = (60 / (this.bpm * this.speedMultiplier)) * 1000 / 4

    this.stepInterval = setInterval(() => {
      this.playStep(selectedAreas, highlightedWords)
      this.currentStep++
    }, stepDuration)
    
    // Play first step immediately
    this.playStep(selectedAreas, highlightedWords)
  }

  playStep(selectedAreas, highlightedWords) {
    if (this.areaTextElements.length === 0 || selectedAreas.length === 0) return

    // Remove previous step borders
    this.currentTextBorders.forEach(border => {
      if (border && border.parentNode) {
        border.parentNode.removeChild(border)
      }
    })
    this.currentTextBorders = []
    // Trim the triggered-elements tracking list (classes are removed by their own timeouts)
    this.triggeredElements = this.triggeredElements.filter(el => el.classList.contains('triggered'))

    // Play step for each area in parallel
    selectedAreas.forEach((selectedArea, areaIndex) => {
      const textElements = this.areaTextElements[areaIndex]
      if (!textElements || textElements.length === 0) return

      const step = this.areaSteps[areaIndex]
      const textEl = textElements[step % textElements.length]

      // Advance step FIRST so a later exception can never freeze the beat
      const nextStep = (step + 1) % textElements.length
      if (nextStep === 0 && this.pendingRefresh) {
        const freshElements = this._filterElementsForArea(
          this.pendingRefresh.allTextElements,
          selectedArea
        )
        if (freshElements.length > 0) {
          this.areaTextElements[areaIndex] = freshElements
        }
        this._pendingRefreshApplied = (this._pendingRefreshApplied || 0) + 1
        if (this._pendingRefreshApplied >= selectedAreas.length) {
          this.pendingRefresh = null
          this._pendingRefreshApplied = 0
        }
      }
      this.areaSteps[areaIndex] = nextStep

      // Verify the element still has a visible position inside the area.
      try {
        const lineRects = this._getRectsForElement(textEl)
        if (lineRects.length === 0) return

        const anchorRect = (selectedArea.anchorElement ?? document.body).getBoundingClientRect()
        const isWithinArea = lineRects.some(r => {
          const relativeX = (r.left + r.width  / 2) - anchorRect.left
          const relativeY = (r.top  + r.height / 2) - anchorRect.top
          return (
            relativeX >= selectedArea.x &&
            relativeY >= selectedArea.y &&
            relativeX <= selectedArea.x + selectedArea.width &&
            relativeY <= selectedArea.y + selectedArea.height
          )
        })
        if (!isWithinArea) return
      } catch (e) {
        return
      }

      // Create highlight border around current text — one border div per line box
      try {
        const lineRects = this._getRectsForElement(textEl)
        lineRects.forEach(rect => {
          const border = document.createElement('div')
          border.className = 'current-text-border'
          border.style.position = 'fixed'
          border.style.left = rect.left + 'px'
          border.style.top = rect.top + 'px'
          border.style.width = rect.width + 'px'
          border.style.height = rect.height + 'px'
          document.body.appendChild(border)
          this.currentTextBorders.push(border)
        })
        const element = textEl.element
        if (element && element.scrollIntoView) {
          element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
        }
      } catch (e) {
        console.warn('Could not create border for text:', e)
      }

      // Use live highlighted words if a refresh is pending, otherwise use the snapshot
      const liveHighlightedWords = this.pendingRefresh
        ? this.pendingRefresh.highlightedWords
        : highlightedWords

      // Notify audio engine of step (no-op in browser mode; sends OSC /step in remote mode)
      const oscInst = this.audioEngine.getMode() === 'remote' ? selectedArea.remoteInstrument : null
      this.audioEngine.playStep(areaIndex, step, textEl.isRedacted, oscInst)

      // If this text is redacted, flash glow and fire drum sound
      if (textEl.isRedacted) {
        try {
          const glowDuration = Math.max(120, (60 / this.bpm) * 1000 / 4 * 0.8)

          // For cross-line phrases, textEl.segments holds one span per line;
          // flash all of them so every segment turns green, not just the first.
          const segmentsToFlash = textEl.segments ?? (textEl.element ? [textEl.element] : [])
          segmentsToFlash.forEach(el => {
            if (el) {
              el.classList.add('triggered')
              this.triggeredElements.push(el)
              setTimeout(() => { el.classList.remove('triggered') }, glowDuration)
            }
          })

          // Match this beat to a highlighted-word entry for drum-sound lookup.
          const textLineRects = this._getRectsForElement(textEl)
          const redactedIndex = liveHighlightedWords.findIndex(redacted => {
            const segments = redacted.segments ?? [redacted.element]
            return segments.some(seg => {
              try {
                const segRect = seg.getBoundingClientRect()
                return textLineRects.some(textRect => !(
                  textRect.right  < segRect.left  ||
                  textRect.left   > segRect.right ||
                  textRect.bottom < segRect.top   ||
                  textRect.top    > segRect.bottom
                ))
              } catch { return false }
            })
          })

          if (redactedIndex >= 0) {
            const inst = this.audioEngine.getMode() === 'remote'
              ? selectedArea.remoteInstrument
              : selectedArea.instrument
            this.audioEngine.playDrumSound(redactedIndex + areaIndex, areaIndex, inst)
          }
        } catch (e) {
          console.warn('Error processing redacted step:', e)
        }
      }
    })
  }

  stop() {
    this.isPlaying = false
    this.currentStep = 0
    this.areaSteps = this.areaSteps.map(() => 0)
    this.pendingRefresh = null
    this._pendingRefreshApplied = 0

    if (this.stepInterval) {
      clearInterval(this.stepInterval)
      this.stepInterval = null
    }

    // Remove step borders
    this.currentTextBorders.forEach(border => {
      if (border && border.parentNode) {
        border.parentNode.removeChild(border)
      }
    })
    this.currentTextBorders = []

    // Remove any lingering glow classes
    this.triggeredElements.forEach(el => {
      if (el) el.classList.remove('triggered')
    })
    this.triggeredElements = []
  }

  setBPM(bpm) {
    this.bpm = Math.max(20, Math.min(300, bpm))
    if (this.isPlaying) this._restartInterval()
  }

  getBPM() {
    return this.bpm
  }

  setSpeedMultiplier(mult) {
    this.speedMultiplier = mult
    if (this.isPlaying) this._restartInterval()
  }

  getSpeedMultiplier() {
    return this.speedMultiplier
  }

  getEffectiveBPM() {
    return Math.round(this.bpm * this.speedMultiplier)
  }


  _restartInterval() {
    if (!this._lastPlayArgs) return
    if (this.stepInterval) {
      clearInterval(this.stepInterval)
      this.stepInterval = null
    }
    const { selectedAreas, highlightedWords } = this._lastPlayArgs
    const stepDuration = (60 / (this.bpm * this.speedMultiplier)) * 1000 / 4
    this.stepInterval = setInterval(() => {
      this.playStep(selectedAreas, highlightedWords)
      this.currentStep++
    }, stepDuration)
  }

  getIsPlaying() {
    return this.isPlaying
  }
}

