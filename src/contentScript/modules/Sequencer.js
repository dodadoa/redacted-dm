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

  // Filter allTextElements down to those whose center falls inside selectedArea
  _filterElementsForArea(allTextElements, selectedArea) {
    return allTextElements.filter(textEl => {
      try {
        const rect = textEl.range.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2
        const anchorRect = selectedArea.anchorElement.getBoundingClientRect()
        const relativeX = centerX - anchorRect.left
        const relativeY = centerY - anchorRect.top
        return (
          relativeX >= selectedArea.x &&
          relativeY >= selectedArea.y &&
          relativeX <= selectedArea.x + selectedArea.width &&
          relativeY <= selectedArea.y + selectedArea.height
        )
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

    const playBtn = document.getElementById('play-btn')
    const stopBtn = document.getElementById('stop-btn')
    if (playBtn) {
      playBtn.disabled = true
      playBtn.classList.add('playing')
    }
    if (stopBtn) {
      stopBtn.disabled = false
    }

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

      // Get current step for this area
      let step = this.areaSteps[areaIndex]
      const textIndex = step % textElements.length
      const textEl = textElements[textIndex]

      // Verify this element is still within the selected area
      try {
        const rect = textEl.range.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) {
          // Move to next step for this area
          this.areaSteps[areaIndex] = (step + 1) % textElements.length
          return
        }
        
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2
        
        // Verify element is within this area's boundaries
        const anchorRect = selectedArea.anchorElement.getBoundingClientRect()
        const relativeX = centerX - anchorRect.left
        const relativeY = centerY - anchorRect.top
        
        const isWithinArea = (
          relativeX >= selectedArea.x &&
          relativeY >= selectedArea.y &&
          relativeX <= selectedArea.x + selectedArea.width &&
          relativeY <= selectedArea.y + selectedArea.height
        )
        
        if (!isWithinArea) {
          // Element is outside area, move to next step
          this.areaSteps[areaIndex] = (step + 1) % textElements.length
          return
        }
      } catch (e) {
        // If we can't verify position, move to next step
        this.areaSteps[areaIndex] = (step + 1) % textElements.length
        return
      }

      // Create green border around current text for this area
      try {
        const rect = textEl.range.getBoundingClientRect()
        if (rect.width > 0 && rect.height > 0) {
          const border = document.createElement('div')
          border.className = 'current-text-border'
          border.style.position = 'fixed'
          border.style.left = rect.left + 'px'
          border.style.top = rect.top + 'px'
          border.style.width = rect.width + 'px'
          border.style.height = rect.height + 'px'
          
          document.body.appendChild(border)
          this.currentTextBorders.push(border)

          // Scroll into view if needed
          const element = textEl.element
          if (element && element.scrollIntoView) {
            element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
          }
        }
      } catch (e) {
        console.warn('Could not create border for text:', e)
      }

      // Use live highlighted words if a refresh is pending, otherwise use the snapshot
      const liveHighlightedWords = this.pendingRefresh
        ? this.pendingRefresh.highlightedWords
        : highlightedWords

      // Always notify the audio engine of the step (used for OSC /step in remote mode)
      this.audioEngine.playStep(areaIndex, step, textEl.isRedacted)

      // If this text is redacted, also fire the trigger sound / OSC message
      if (textEl.isRedacted) {
        // Flash the redacted element with a bright glow
        const el = textEl.element
        if (el) {
          el.classList.add('triggered')
          this.triggeredElements.push(el)
          const glowDuration = Math.max(120, (60 / this.bpm) * 1000 / 4 * 0.8)
          setTimeout(() => {
            el.classList.remove('triggered')
          }, glowDuration)
        }

        // Find which redacted word this corresponds to
        const redactedIndex = liveHighlightedWords.findIndex(redacted => {
          const redactedRect = redacted.element.getBoundingClientRect()
          const textRect = textEl.range.getBoundingClientRect()
          return !(
            textRect.right < redactedRect.left ||
            textRect.left > redactedRect.right ||
            textRect.bottom < redactedRect.top ||
            textRect.top > redactedRect.bottom
          )
        })
        
        if (redactedIndex >= 0) {
          this.audioEngine.playDrumSound(redactedIndex + areaIndex, areaIndex, selectedArea.instrument)
        }
      }

      // Advance step — apply any pending refresh at the start of a new cycle
      const nextStep = (step + 1) % textElements.length
      if (nextStep === 0 && this.pendingRefresh) {
        const freshElements = this._filterElementsForArea(
          this.pendingRefresh.allTextElements,
          selectedArea
        )
        if (freshElements.length > 0) {
          this.areaTextElements[areaIndex] = freshElements
        }
        // Clear once all areas have wrapped and been refreshed
        this._pendingRefreshApplied = (this._pendingRefreshApplied || 0) + 1
        if (this._pendingRefreshApplied >= selectedAreas.length) {
          this.pendingRefresh = null
          this._pendingRefreshApplied = 0
        }
      }
      this.areaSteps[areaIndex] = nextStep
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

    const playBtn = document.getElementById('play-btn')
    const stopBtn = document.getElementById('stop-btn')
    if (playBtn) {
      playBtn.disabled = false
      playBtn.classList.remove('playing')
    }
    if (stopBtn) {
      stopBtn.disabled = true
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
    const bpmInput = document.getElementById('bpm-input')
    if (bpmInput) bpmInput.value = this.bpm
    this._updateEffectiveBpmDisplay()
    if (this.isPlaying) this._restartInterval()
  }

  getBPM() {
    return this.bpm
  }

  setSpeedMultiplier(mult) {
    this.speedMultiplier = mult
    this._updateEffectiveBpmDisplay()
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

