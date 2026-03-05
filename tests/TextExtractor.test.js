import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { TextExtractor } from '../src/contentScript/modules/TextExtractor.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a selectedArea anchored on el, covering the given bounds. */
function makeArea(anchorElement, { x = 0, y = 0, width = 9999, height = 9999 } = {}) {
  return { anchorElement, x, y, width, height }
}

/** Append a plain text node to el. */
function appendText(el, text) {
  el.appendChild(document.createTextNode(text))
}

/**
 * Append a .highlighted-text span containing text to el.
 * Returns the span — pass it as { text, element: span } in highlightedWords.
 */
function appendHighlighted(el, text) {
  const span = document.createElement('span')
  span.className = 'highlighted-text'
  span.textContent = text
  el.appendChild(span)
  return span
}

// ── Layout mocks ──────────────────────────────────────────────────────────────
// jsdom doesn't implement layout. Element.prototype.getBoundingClientRect
// exists but returns zeros; Range.prototype.getBoundingClientRect is not
// defined at all. We set both up manually so the extractor's visibility
// checks pass by default.

// Elements default to a zero-size rect — this prevents the rect-overlap
// fallback in the isRedacted check from firing spuriously across elements.
// The coarse walker filter still passes because (0 + 0) is not < area.x (0).
const ELEMENT_RECT = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }
const RANGE_RECT   = { left: 10, top: 10, right: 70, bottom: 30, width: 60, height: 20 }

let originalRangeBoundingClientRect

beforeEach(() => {
  originalRangeBoundingClientRect = Range.prototype.getBoundingClientRect
  Range.prototype.getBoundingClientRect = vi.fn().mockReturnValue(RANGE_RECT)
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(ELEMENT_RECT)
})

afterEach(() => {
  Range.prototype.getBoundingClientRect = originalRangeBoundingClientRect
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TextExtractor', () => {
  let extractor, container

  beforeEach(() => {
    extractor = new TextExtractor()
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  // ── getAllTextElements ──────────────────────────────────────────────────────

  describe('getAllTextElements', () => {
    it('returns [] before any extraction', () => {
      expect(extractor.getAllTextElements()).toEqual([])
    })

    it('returns the same array as the last extraction call', () => {
      appendText(container, 'hello')
      const result = extractor.extractAllTextElements([makeArea(container)], [])
      expect(extractor.getAllTextElements()).toBe(result)
    })
  })

  // ── extractAllTextElements ─────────────────────────────────────────────────

  describe('extractAllTextElements', () => {
    it('returns [] and resets cache when no areas are given', () => {
      appendText(container, 'ignored')
      extractor.extractAllTextElements([makeArea(container)], [])
      const result = extractor.extractAllTextElements([], [])
      expect(result).toEqual([])
      expect(extractor.getAllTextElements()).toEqual([])
    })

    it('extracts individual words from a plain text node', () => {
      appendText(container, 'one two three')
      const result = extractor.extractAllTextElements([makeArea(container)], [])
      expect(result.map(e => e.text)).toEqual(['one', 'two', 'three'])
    })

    it('trims punctuation clusters: each non-whitespace token becomes one element', () => {
      appendText(container, 'hello, world!')
      const result = extractor.extractAllTextElements([makeArea(container)], [])
      expect(result.map(e => e.text)).toEqual(['hello,', 'world!'])
    })

    it('skips whitespace-only text nodes', () => {
      container.appendChild(document.createTextNode('   \n   '))
      const result = extractor.extractAllTextElements([makeArea(container)], [])
      expect(result).toHaveLength(0)
    })

    it('each element carries a cloned Range and its parent Element', () => {
      appendText(container, 'alpha beta')
      const result = extractor.extractAllTextElements([makeArea(container)], [])
      result.forEach(el => {
        expect(el.range).toBeInstanceOf(Range)
        expect(el.element).toBeInstanceOf(Element)
        expect(el.isRedacted).toBe(false)
      })
    })

    it('extracts words from nested elements inside the anchor', () => {
      const inner = document.createElement('p')
      inner.textContent = 'nested word'
      container.appendChild(inner)
      const result = extractor.extractAllTextElements([makeArea(container)], [])
      expect(result.map(e => e.text)).toEqual(['nested', 'word'])
    })

    // ── UI exclusions ─────────────────────────────────────────────────────────

    it('excludes text inside .drum-machine-overlay', () => {
      const overlay = document.createElement('div')
      overlay.className = 'drum-machine-overlay'
      appendText(overlay, 'ui text')
      container.appendChild(overlay)
      appendText(container, 'real')
      const result = extractor.extractAllTextElements([makeArea(container)], [])
      expect(result.map(e => e.text)).toEqual(['real'])
    })

    it('excludes text inside .area-instrument-pill', () => {
      const pill = document.createElement('button')
      pill.className = 'area-instrument-pill'
      appendText(pill, 'KICK')
      container.appendChild(pill)
      appendText(container, 'content')
      const result = extractor.extractAllTextElements([makeArea(container)], [])
      expect(result.map(e => e.text)).toEqual(['content'])
    })

    it('excludes text inside .area-selector-header', () => {
      const header = document.createElement('div')
      header.className = 'area-selector-header'
      appendText(header, 'header')
      container.appendChild(header)
      appendText(container, 'body')
      const result = extractor.extractAllTextElements([makeArea(container)], [])
      expect(result.map(e => e.text)).toEqual(['body'])
    })

    it('excludes text inside .area-border-overlay', () => {
      const border = document.createElement('div')
      border.className = 'area-border-overlay'
      appendText(border, 'border')
      container.appendChild(border)
      appendText(container, 'visible')
      const result = extractor.extractAllTextElements([makeArea(container)], [])
      expect(result.map(e => e.text)).toEqual(['visible'])
    })

    // ── Area bounds filtering ─────────────────────────────────────────────────

    it('excludes words whose center falls outside the selected area', () => {
      appendText(container, 'inside outside')
      Range.prototype.getBoundingClientRect = vi.fn().mockImplementation(function () {
        const word = this.startContainer?.nodeValue
          ?.substring(this.startOffset, this.endOffset)
          ?.trim()
        // 'outside' is placed far to the right, beyond the area
        return word === 'outside'
          ? { left: 500, top: 10, right: 560, bottom: 30, width: 60, height: 20 }
          : { left: 10,  top: 10, right:  70, bottom: 30, width: 60, height: 20 }
      })
      const result = extractor.extractAllTextElements(
        [makeArea(container, { x: 0, y: 0, width: 100, height: 100 })],
        []
      )
      expect(result.map(e => e.text)).toEqual(['inside'])
    })

    it('does not duplicate words that appear in multiple overlapping areas', () => {
      appendText(container, 'shared')
      const area1 = makeArea(container)
      const area2 = makeArea(container)
      const result = extractor.extractAllTextElements([area1, area2], [])
      expect(result.filter(e => e.text === 'shared')).toHaveLength(1)
    })

    it('collects words from multiple non-overlapping areas', () => {
      const container2 = document.createElement('div')
      document.body.appendChild(container2)
      appendText(container, 'area-one')
      appendText(container2, 'area-two')
      const result = extractor.extractAllTextElements(
        [makeArea(container), makeArea(container2)],
        []
      )
      expect(result.map(e => e.text)).toContain('area-one')
      expect(result.map(e => e.text)).toContain('area-two')
    })

    // ── Sorting ───────────────────────────────────────────────────────────────

    it('sorts words top-to-bottom then left-to-right', () => {
      appendText(container, 'b a c')
      // Assign distinct positions: 'b' at left:100, 'a' at left:10, 'c' at left:50
      const positions = { b: 100, a: 10, c: 50 }
      Range.prototype.getBoundingClientRect = vi.fn().mockImplementation(function () {
        const word = this.startContainer?.nodeValue
          ?.substring(this.startOffset, this.endOffset)
          ?.trim()
        const left = positions[word] ?? 10
        return { left, top: 10, right: left + 40, bottom: 30, width: 40, height: 20 }
      })
      const result = extractor.extractAllTextElements([makeArea(container)], [])
      expect(result.map(e => e.text)).toEqual(['a', 'c', 'b'])
    })

    it('treats elements on the same line (top diff ≤ 5px) as left-to-right', () => {
      appendText(container, 'right left')
      const positions = { right: 80, left: 10 }
      Range.prototype.getBoundingClientRect = vi.fn().mockImplementation(function () {
        const word = this.startContainer?.nodeValue
          ?.substring(this.startOffset, this.endOffset)
          ?.trim()
        const left = positions[word] ?? 10
        // top differs by 3px — within the 5px threshold → same line
        const top = word === 'right' ? 13 : 10
        return { left, top, right: left + 40, bottom: top + 20, width: 40, height: 20 }
      })
      const result = extractor.extractAllTextElements([makeArea(container)], [])
      expect(result.map(e => e.text)).toEqual(['left', 'right'])
    })

    // ── isRedacted marking ────────────────────────────────────────────────────

    it('marks a word as isRedacted when its element is the highlighted span', () => {
      const span = appendHighlighted(container, 'secret')
      appendText(container, 'plain')
      const result = extractor.extractAllTextElements(
        [makeArea(container)],
        [{ text: 'secret', element: span }]
      )
      expect(result.find(e => e.text === 'secret')?.isRedacted).toBe(true)
      expect(result.find(e => e.text === 'plain')?.isRedacted).toBe(false)
    })

    it('marks a word as isRedacted when it is nested inside the highlighted span', () => {
      const span = document.createElement('span')
      span.className = 'highlighted-text'
      const inner = document.createElement('em')
      inner.textContent = 'nested'
      span.appendChild(inner)
      container.appendChild(span)
      const result = extractor.extractAllTextElements(
        [makeArea(container)],
        [{ text: 'nested', element: span }]
      )
      expect(result.find(e => e.text === 'nested')?.isRedacted).toBe(true)
    })

    it('marks a word via rect overlap when DOM containment does not match', () => {
      appendText(container, 'overlap')
      const fakeSpan = document.createElement('span')
      fakeSpan.className = 'highlighted-text'
      document.body.appendChild(fakeSpan)
      // Give fakeSpan the same rect as the word range so overlap > 30%
      vi.spyOn(fakeSpan, 'getBoundingClientRect').mockReturnValue(RANGE_RECT)
      const result = extractor.extractAllTextElements(
        [makeArea(container)],
        [{ text: 'overlap', element: fakeSpan }]
      )
      expect(result.find(e => e.text === 'overlap')?.isRedacted).toBe(true)
    })

    // ── Phrase grouping / merging ──────────────────────────────────────────────

    it('keeps a single-word redact as exactly one beat element', () => {
      const span = appendHighlighted(container, 'word')
      const result = extractor.extractAllTextElements(
        [makeArea(container)],
        [{ text: 'word', element: span }]
      )
      const redacted = result.filter(e => e.isRedacted)
      expect(redacted).toHaveLength(1)
      expect(redacted[0].text).toBe('word')
    })

    it('merges a multi-word free-redact phrase into one beat element', () => {
      const span = appendHighlighted(container, 'hello world foo')
      const result = extractor.extractAllTextElements(
        [makeArea(container)],
        [{ text: 'hello world foo', element: span }]
      )
      const redacted = result.filter(e => e.isRedacted)
      expect(redacted).toHaveLength(1)
      expect(redacted[0].text).toBe('hello world foo')
    })

    it('merged element uses the .highlighted-text span as its element', () => {
      const span = appendHighlighted(container, 'a b')
      const result = extractor.extractAllTextElements(
        [makeArea(container)],
        [{ text: 'a b', element: span }]
      )
      const merged = result.find(e => e.isRedacted)
      expect(merged?.element).toBe(span)
    })

    it('two separate redacted phrases produce two independent beat elements', () => {
      const span1 = appendHighlighted(container, 'phrase one')
      const span2 = appendHighlighted(container, 'phrase two')
      const result = extractor.extractAllTextElements(
        [makeArea(container)],
        [
          { text: 'phrase one', element: span1 },
          { text: 'phrase two', element: span2 },
        ]
      )
      const redacted = result.filter(e => e.isRedacted)
      expect(redacted).toHaveLength(2)
    })

    // ── Document order ────────────────────────────────────────────────────────

    it('preserves document order: plain → redacted phrase → plain', () => {
      appendText(container, 'before ')
      const span = appendHighlighted(container, 'redacted phrase')
      appendText(container, ' after')

      // All ranges share the same rect → sort diffs are 0 → stable sort preserves DOM order
      const result = extractor.extractAllTextElements(
        [makeArea(container)],
        [{ text: 'redacted phrase', element: span }]
      )
      expect(result.map(e => e.text)).toEqual(['before', 'redacted phrase', 'after'])
    })
  })
})
