const UI_SELECTOR =
  '.area-instrument-pill, .area-selector-header, .area-border-overlay, .drum-machine-overlay'

export class TextExtractor {
  constructor() {
    this.allTextElements = []
  }

  extractAllTextElements(selectedAreas, highlightedWords) {
    if (selectedAreas.length === 0) {
      this.allTextElements = []
      return []
    }

    const processedNodes = new Set()
    const words = selectedAreas.flatMap(area => this._collectWords(area, processedNodes))

    this._sortByPosition(words)
    this._markRedacted(words, highlightedWords)

    this.allTextElements = this._mergeGroups(words)
    return this.allTextElements
  }

  getAllTextElements() {
    return this.allTextElements
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /** Walk text nodes inside `area`, return one entry per visible word. */
  _collectWords(area, processedNodes) {
    const root = area.anchorElement || document.body
    const anchorRect = root.getBoundingClientRect()
    const words = []

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        if (processedNodes.has(node)) return NodeFilter.FILTER_REJECT
        const parent = node.parentElement
        if (!parent) return NodeFilter.FILTER_REJECT
        if (parent.closest?.(UI_SELECTOR)) return NodeFilter.FILTER_REJECT

        const r = parent.getBoundingClientRect()
        const relLeft = r.left - anchorRect.left
        const relTop  = r.top  - anchorRect.top
        const overlaps = !(
          relLeft + r.width  < area.x ||
          relLeft            > area.x + area.width  ||
          relTop  + r.height < area.y ||
          relTop             > area.y + area.height
        )
        if (overlaps && node.nodeValue.trim().length > 0) {
          processedNodes.add(node)
          return NodeFilter.FILTER_ACCEPT
        }
        return NodeFilter.FILTER_REJECT
      },
    })

    let node
    while ((node = walker.nextNode())) {
      this._wordsFromNode(node, area, anchorRect, words)
    }
    return words
  }

  /** Split a single text node into per-word Range entries. */
  _wordsFromNode(node, area, anchorRect, out) {
    let offset = 0
    for (const part of node.nodeValue.split(/(\S+)/)) {
      const len = part.length
      if (part.trim().length > 0) {
        try {
          const range = document.createRange()
          range.setStart(node, offset)
          range.setEnd(node, offset + len)
          const rect = range.getBoundingClientRect()
          if (rect.width > 0 && rect.height > 0 && this._wordInArea(rect, anchorRect, area)) {
            out.push({ text: part.trim(), range: range.cloneRange(), element: node.parentElement, isRedacted: false })
          }
        } catch {
          // skip if range creation fails
        }
      }
      offset += len
    }
  }

  /** True if `wordRect` centre or overlap falls within `area`. */
  _wordInArea(wordRect, anchorRect, area) {
    const relLeft = wordRect.left - anchorRect.left
    const relTop  = wordRect.top  - anchorRect.top
    const cx = relLeft + wordRect.width  / 2
    const cy = relTop  + wordRect.height / 2
    if (cx >= area.x && cy >= area.y && cx <= area.x + area.width && cy <= area.y + area.height) {
      return true
    }
    // Fallback: word straddles the edge — accept any overlap
    return !(
      relLeft + wordRect.width  < area.x ||
      relLeft                   > area.x + area.width  ||
      relTop  + wordRect.height < area.y ||
      relTop                    > area.y + area.height
    )
  }

  /** Sort words top-to-bottom, then left-to-right (5 px line-height tolerance). */
  _sortByPosition(words) {
    words.sort((a, b) => {
      try {
        const ra = a.range.getBoundingClientRect()
        const rb = b.range.getBoundingClientRect()
        const dy = ra.top - rb.top
        return Math.abs(dy) > 5 ? dy : ra.left - rb.left
      } catch {
        return 0
      }
    })
  }

  /** Annotate each word with its matched highlighted phrase (if any). */
  _markRedacted(words, highlightedWords) {
    words.forEach(word => {
      try {
        const wordRect = word.range.getBoundingClientRect()
        const matches = highlightedWords.filter(hl => this._matchesHighlight(word, wordRect, hl))
        word.isRedacted     = matches.length > 0
        word.matchedRedacted = matches.length > 0
          // Prefer the outermost span so nested word-spans stay grouped under their free-redact parent
          ? (matches.find(r => !matches.some(o => o !== r && o.element.contains(r.element))) ?? matches[0])
          : null
      } catch {
        word.isRedacted      = false
        word.matchedRedacted = null
      }
    })
  }

  /**
   * True when `word` overlaps with highlighted phrase `hl`.
   * For cross-line redactions `hl.segments` holds one span per line segment;
   * we check all of them so words on line 2+ are still matched to the phrase.
   */
  _matchesHighlight(word, wordRect, hl) {
    try {
      const elements = [hl.element, ...(hl.segments ?? [])]
      // DOM containment check — fastest, covers the common case
      for (const el of elements) {
        if (el.contains(word.element) || word.element === el) return true
      }
      // Rect-overlap fallback — handles edge cases where the word's parent element
      // is not inside the span but still visually overlaps it
      for (const el of elements) {
        try {
          const elRect = el.getBoundingClientRect()
          const ox = Math.max(0, Math.min(wordRect.right,  elRect.right)  - Math.max(wordRect.left, elRect.left))
          const oy = Math.max(0, Math.min(wordRect.bottom, elRect.bottom) - Math.max(wordRect.top,  elRect.top))
          if (ox * oy > wordRect.width * wordRect.height * 0.3) return true
        } catch {
          // skip this element
        }
      }
      return false
    } catch {
      return false
    }
  }

  /**
   * Emit words in order; multi-word redacted phrases become one merged beat.
   * Single-word redacts and plain words pass through unchanged.
   */
  _mergeGroups(words) {
    // Group each redacted word under its phrase span
    const groups = new Map()
    words.forEach(w => {
      if (!w.isRedacted || !w.matchedRedacted) return
      const g = groups.get(w.matchedRedacted)
      if (g) g.push(w)
      else groups.set(w.matchedRedacted, [w])
    })

    const result = []
    const seen   = new Set()

    words.forEach(w => {
      if (!w.isRedacted) {
        result.push(w)
        return
      }
      const phrase = w.matchedRedacted
      if (!phrase || seen.has(phrase)) return
      seen.add(phrase)

      const group = groups.get(phrase) ?? [w]
      if (group.length === 1) {
        result.push(w)
        return
      }
      // Multi-word: merge into a single beat spanning first → last word
      const first  = group[0]
      const last   = group[group.length - 1]
      const merged = {
        text:       group.map(e => e.text).join(' '),
        range:      first.range.cloneRange(),
        element:    first.element?.closest?.('.highlighted-text') ?? first.element,
        // Carry the phrase's segment spans so the Sequencer can flash all lines
        segments:   phrase?.segments ?? null,
        isRedacted: true,
      }
      try { merged.range.setEnd(last.range.endContainer, last.range.endOffset) } catch {}
      result.push(merged)
    })

    return result
  }
}
