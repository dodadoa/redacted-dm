export class Sequencer {
  constructor(audioEngine) {
    this.audioEngine = audioEngine
    this.isPlaying = false
    this.currentStep = 0
    this.areaSteps = []
    this.areaTextElements = []
    this.bpm = 120
    this.stepInterval = null
    this.currentTextBorders = []
  }

  play(selectedAreas, allTextElements, highlightedWords) {
    if (selectedAreas.length === 0) {
      alert('Please select at least one area first!')
      return
    }

    // Separate text elements by area
    this.areaTextElements = []
    this.areaSteps = []
    
    selectedAreas.forEach((selectedArea, areaIndex) => {
      const elementsInThisArea = allTextElements.filter(textEl => {
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
      
      this.areaTextElements.push(elementsInThisArea)
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

    // Calculate step duration in milliseconds (16th notes)
    const stepDuration = (60 / this.bpm) * 1000 / 4

    this.stepInterval = setInterval(() => {
      this.playStep(selectedAreas, highlightedWords)
      this.currentStep++
    }, stepDuration)
    
    // Play first step immediately
    this.playStep(selectedAreas, highlightedWords)
  }

  playStep(selectedAreas, highlightedWords) {
    if (this.areaTextElements.length === 0 || selectedAreas.length === 0) return

    // Remove previous borders
    this.currentTextBorders.forEach(border => {
      if (border && border.parentNode) {
        border.parentNode.removeChild(border)
      }
    })
    this.currentTextBorders = []

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

      // Always notify the audio engine of the step (used for OSC /step in remote mode)
      this.audioEngine.playStep(areaIndex, step, textEl.isRedacted)

      // If this text is redacted, also fire the trigger sound / OSC message
      if (textEl.isRedacted) {
        // Find which redacted word this corresponds to
        const redactedIndex = highlightedWords.findIndex(redacted => {
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
          this.audioEngine.playDrumSound(redactedIndex + areaIndex, areaIndex)
        }
      }

      // Advance step for this area
      this.areaSteps[areaIndex] = (step + 1) % textElements.length
    })
  }

  stop() {
    this.isPlaying = false
    this.currentStep = 0
    this.areaSteps = this.areaSteps.map(() => 0)

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

    // Remove green borders
    this.currentTextBorders.forEach(border => {
      if (border && border.parentNode) {
        border.parentNode.removeChild(border)
      }
    })
    this.currentTextBorders = []
  }

  setBPM(bpm) {
    this.bpm = Math.max(60, Math.min(200, bpm))
    const bpmInput = document.getElementById('bpm-input')
    if (bpmInput) {
      bpmInput.value = this.bpm
    }
  }

  getBPM() {
    return this.bpm
  }

  getIsPlaying() {
    return this.isPlaying
  }
}

