import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { TextHighlighter } from '../src/contentScript/modules/TextHighlighter.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Create a range over a substring of a text node. */
function createRange(textNode, start, end) {
  const range = document.createRange()
  range.setStart(textNode, start)
  range.setEnd(textNode, end)
  return range
}

/** Find the first text node in a container. */
function getTextNode(container) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  return walker.nextNode()
}

/** Find all text nodes in a container (direct children only, not inside nested elements). */
function getDirectTextNodes(container) {
  return Array.from(container.childNodes).filter(n => n.nodeType === Node.TEXT_NODE)
}

// ── Layout mocks ───────────────────────────────────────────────────────────────
// JSDOM does not implement Range.prototype.getBoundingClientRect or
// getClientRects. Element.prototype.getBoundingClientRect exists but returns zeros.
// We mock both so overlap checks and area validation behave predictably.

const OVERLAP_RECT = { left: 10, top: 10, right: 70, bottom: 30, width: 60, height: 20 }
const NO_OVERLAP_RECT = { left: 200, top: 200, right: 260, bottom: 220, width: 60, height: 20 }

let originalRangeGetBoundingClientRect
let originalRangeGetClientRects

beforeEach(() => {
  originalRangeGetBoundingClientRect = Range.prototype.getBoundingClientRect
  originalRangeGetClientRects = Range.prototype.getClientRects

  Range.prototype.getBoundingClientRect = vi.fn().mockReturnValue(OVERLAP_RECT)
  Range.prototype.getClientRects = vi.fn().mockReturnValue([OVERLAP_RECT])
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(OVERLAP_RECT)
})

afterEach(() => {
  Range.prototype.getBoundingClientRect = originalRangeGetBoundingClientRect
  Range.prototype.getClientRects = originalRangeGetClientRects
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

// ── Tests ───────────────────────────────────────────────────────────────────

describe('TextHighlighter', () => {
  let highlighter
  let container

  beforeEach(() => {
    highlighter = new TextHighlighter()
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  // ── setRedactMode / getRedactMode ───────────────────────────────────────────

  describe('setRedactMode / getRedactMode', () => {
    it('defaults to free mode', () => {
      expect(highlighter.getRedactMode()).toBe('free')
    })

    it('sets and returns word mode', () => {
      highlighter.setRedactMode('word')
      expect(highlighter.getRedactMode()).toBe('word')
    })

    it('sets and returns free mode', () => {
      highlighter.setRedactMode('free')
      expect(highlighter.getRedactMode()).toBe('free')
    })
  })

  // ── addHighlightedWord (single text node) ────────────────────────────────────

  describe('addHighlightedWord', () => {
    it('wraps selected text in a .highlighted-text span', () => {
      container.appendChild(document.createTextNode('hello world'))
      const textNode = getTextNode(container)
      const range = createRange(textNode, 0, 5)

      highlighter.addHighlightedWord('hello', range)

      const span = container.querySelector('.highlighted-text')
      expect(span).toBeTruthy()
      expect(span.textContent).toBe('hello')
      expect(container.textContent).toBe('hello world')
    })

    it('preserves text before and after the selection', () => {
      container.appendChild(document.createTextNode('before X after'))
      const textNode = getTextNode(container)
      const range = createRange(textNode, 7, 8)

      highlighter.addHighlightedWord('X', range)

      expect(container.textContent).toBe('before X after')
      const span = container.querySelector('.highlighted-text')
      expect(span.textContent).toBe('X')
    })

    it('stores the span in highlightedWords with text and segments', () => {
      container.appendChild(document.createTextNode('secret'))
      const textNode = getTextNode(container)
      const range = createRange(textNode, 0, 6)

      highlighter.addHighlightedWord('secret', range)

      const words = highlighter.getHighlightedWords()
      expect(words).toHaveLength(1)
      expect(words[0].text).toBe('secret')
      expect(words[0].element).toBeInstanceOf(HTMLSpanElement)
      expect(words[0].segments).toHaveLength(1)
      expect(words[0].segments[0]).toBe(words[0].element)
    })

    it('assigns data-word-index to each span', () => {
      const paragraphOne = document.createElement('p')
      paragraphOne.appendChild(document.createTextNode('one'))
      const paragraphTwo = document.createElement('p')
      paragraphTwo.appendChild(document.createTextNode('two'))
      container.appendChild(paragraphOne)
      container.appendChild(paragraphTwo)

      vi.mocked(Range.prototype.getBoundingClientRect).mockReturnValue(NO_OVERLAP_RECT)
      highlighter.addHighlightedWord('one', createRange(getTextNode(paragraphOne), 0, 3))
      highlighter.addHighlightedWord('two', createRange(getTextNode(paragraphTwo), 0, 3))

      const spans = container.querySelectorAll('.highlighted-text')
      expect(spans).toHaveLength(2)
      expect(spans[0].getAttribute('data-word-index')).toBe('0')
      expect(spans[1].getAttribute('data-word-index')).toBe('1')
    })

    it('does not add when range is collapsed', () => {
      container.appendChild(document.createTextNode('hello'))
      const textNode = getTextNode(container)
      const range = createRange(textNode, 2, 2)

      highlighter.addHighlightedWord('', range)

      expect(highlighter.getHighlightedWords()).toHaveLength(0)
      expect(container.querySelector('.highlighted-text')).toBeNull()
    })

    it('does not add when text is already redacted (overlap)', () => {
      container.appendChild(document.createTextNode('hello world'))
      const textNode = getTextNode(container)
      highlighter.addHighlightedWord('hello', createRange(textNode, 0, 5))

      const range2 = createRange(getTextNode(container), 0, 3)
      Range.prototype.getBoundingClientRect = vi.fn().mockReturnValue(OVERLAP_RECT)
      highlighter.addHighlightedWord('hel', range2)

      expect(highlighter.getHighlightedWords()).toHaveLength(1)
    })
  })

  // ── addHighlightedWord (multi-node / cross-line) ──────────────────────────────

  describe('addHighlightedWord multi-node', () => {
    it('creates separate spans for each text node in a cross-paragraph range', () => {
      const paragraphOne = document.createElement('p')
      paragraphOne.appendChild(document.createTextNode('line one'))
      const paragraphTwo = document.createElement('p')
      paragraphTwo.appendChild(document.createTextNode('line two'))
      container.appendChild(paragraphOne)
      container.appendChild(paragraphTwo)

      const range = document.createRange()
      range.setStart(getTextNode(paragraphOne), 0)
      range.setEnd(getTextNode(paragraphTwo), 8)

      highlighter.addHighlightedWord('line oneline two', range)

      const spans = container.querySelectorAll('.highlighted-text')
      expect(spans).toHaveLength(2)
      expect(spans[0].textContent).toBe('line one')
      expect(spans[1].textContent).toBe('line two')
      expect(highlighter.getHighlightedWords()[0].segments).toHaveLength(2)
    })

    it('preserves DOM structure when wrapping cross-paragraph selection', () => {
      const paragraphOne = document.createElement('p')
      paragraphOne.appendChild(document.createTextNode('x'))
      const paragraphTwo = document.createElement('p')
      paragraphTwo.appendChild(document.createTextNode('y'))
      container.appendChild(paragraphOne)
      container.appendChild(paragraphTwo)

      const range = document.createRange()
      range.setStart(getTextNode(paragraphOne), 0)
      range.setEnd(getTextNode(paragraphTwo), 1)

      highlighter.addHighlightedWord('xy', range)

      expect(paragraphOne.textContent).toBe('x')
      expect(paragraphTwo.textContent).toBe('y')
      const spans = container.querySelectorAll('.highlighted-text')
      expect(spans).toHaveLength(2)
      expect(spans[0].textContent).toBe('x')
      expect(spans[1].textContent).toBe('y')
    })
  })

  // ── isAlreadyRedacted ────────────────────────────────────────────────────────

  describe('isAlreadyRedacted', () => {
    it('returns true when range overlaps an existing highlight', () => {
      container.appendChild(document.createTextNode('redacted word'))
      const textNode = getTextNode(container)
      highlighter.addHighlightedWord('redacted', createRange(textNode, 0, 8))

      const checkRange = createRange(getTextNode(container), 0, 4)
      Range.prototype.getBoundingClientRect = vi.fn().mockReturnValue(OVERLAP_RECT)
      expect(highlighter.isAlreadyRedacted(checkRange)).toBe(true)
    })

    it('returns false when range does not overlap any highlight', () => {
      container.appendChild(document.createTextNode('hello world'))
      const textNode = getTextNode(container)
      highlighter.addHighlightedWord('hello', createRange(textNode, 0, 5))

      // After add, structure is span("hello") + " world"; "world" is at offset 1–6
      const worldTextNode = getDirectTextNodes(container)[0]
      const checkRange = createRange(worldTextNode, 1, 6)
      vi.mocked(Range.prototype.getBoundingClientRect).mockReturnValue(NO_OVERLAP_RECT)
      expect(highlighter.isAlreadyRedacted(checkRange)).toBe(false)
    })

    it('checks each segment for multi-segment highlights', () => {
      const paragraphOne = document.createElement('p')
      paragraphOne.appendChild(document.createTextNode('one'))
      const paragraphTwo = document.createElement('p')
      paragraphTwo.appendChild(document.createTextNode('two'))
      container.appendChild(paragraphOne)
      container.appendChild(paragraphTwo)

      const range = document.createRange()
      range.setStart(getTextNode(paragraphOne), 0)
      range.setEnd(getTextNode(paragraphTwo), 3)
      highlighter.addHighlightedWord('onetwo', range)

      const checkRange = createRange(getTextNode(paragraphTwo), 0, 3)
      Range.prototype.getBoundingClientRect = vi.fn().mockReturnValue(OVERLAP_RECT)
      expect(highlighter.isAlreadyRedacted(checkRange)).toBe(true)
    })
  })

  // ── redactWords ──────────────────────────────────────────────────────────────

  describe('redactWords', () => {
    it('wraps the selected words with spans', () => {
      container.appendChild(document.createTextNode('one two three'))
      const textNode = getTextNode(container)
      const range = createRange(textNode, 0, 13)

      highlighter.redactWords(range)

      const spans = container.querySelectorAll('.highlighted-text')
      expect(spans.length).toBeGreaterThanOrEqual(1)
      expect(container.textContent).toBe('one two three')
      expect(highlighter.getHighlightedWords().map(w => w.text)).toContain('one')
    })

    it('skips words that are already redacted', () => {
      const paragraphOne = document.createElement('p')
      paragraphOne.appendChild(document.createTextNode('a'))
      const paragraphTwo = document.createElement('p')
      paragraphTwo.appendChild(document.createTextNode('b'))
      const paragraphThree = document.createElement('p')
      paragraphThree.appendChild(document.createTextNode('c'))
      container.appendChild(paragraphOne)
      container.appendChild(paragraphTwo)
      container.appendChild(paragraphThree)

      vi.mocked(Range.prototype.getBoundingClientRect).mockReturnValue(NO_OVERLAP_RECT)
      highlighter.addHighlightedWord('b', createRange(getTextNode(paragraphTwo), 0, 1))

      vi.mocked(Range.prototype.getBoundingClientRect).mockImplementation(function () {
        const text = this.toString?.() ?? ''
        return text === 'b' ? OVERLAP_RECT : NO_OVERLAP_RECT
      })
      const range = document.createRange()
      range.setStart(getTextNode(paragraphOne), 0)
      range.setEnd(getTextNode(paragraphThree), 1)
      highlighter.redactWords(range)

      const words = highlighter.getHighlightedWords()
      expect(words.map(w => w.text)).toContain('a')
      expect(words.map(w => w.text)).toContain('b')
      expect(words.map(w => w.text)).toContain('c')
      expect(words.filter(w => w.text === 'b')).toHaveLength(1)
    })
  })

  // ── undoLastRedaction ───────────────────────────────────────────────────────

  describe('undoLastRedaction', () => {
    it('removes the last added highlight and restores plain text', () => {
      container.appendChild(document.createTextNode('hello world'))
      const textNode = getTextNode(container)
      highlighter.addHighlightedWord('world', createRange(textNode, 6, 11))

      highlighter.undoLastRedaction()

      expect(container.querySelector('.highlighted-text')).toBeNull()
      expect(container.textContent).toBe('hello world')
      expect(highlighter.getHighlightedWords()).toHaveLength(0)
    })

    it('undoes multi-segment highlights by restoring all segments', () => {
      const paragraphOne = document.createElement('p')
      paragraphOne.appendChild(document.createTextNode('a'))
      const paragraphTwo = document.createElement('p')
      paragraphTwo.appendChild(document.createTextNode('b'))
      container.appendChild(paragraphOne)
      container.appendChild(paragraphTwo)

      const range = document.createRange()
      range.setStart(getTextNode(paragraphOne), 0)
      range.setEnd(getTextNode(paragraphTwo), 1)
      highlighter.addHighlightedWord('ab', range)

      highlighter.undoLastRedaction()

      expect(container.querySelectorAll('.highlighted-text')).toHaveLength(0)
      expect(paragraphOne.textContent).toBe('a')
      expect(paragraphTwo.textContent).toBe('b')
    })

    it('does nothing when there are no highlights', () => {
      container.appendChild(document.createTextNode('plain'))
      highlighter.undoLastRedaction()
      expect(container.textContent).toBe('plain')
    })
  })

  // ── clearHighlights ──────────────────────────────────────────────────────────

  describe('clearHighlights', () => {
    it('removes all highlights and restores plain text', () => {
      const paragraphOne = document.createElement('p')
      paragraphOne.appendChild(document.createTextNode('one'))
      const paragraphTwo = document.createElement('p')
      paragraphTwo.appendChild(document.createTextNode('two'))
      const paragraphThree = document.createElement('p')
      paragraphThree.appendChild(document.createTextNode('three'))
      container.appendChild(paragraphOne)
      container.appendChild(paragraphTwo)
      container.appendChild(paragraphThree)

      highlighter.addHighlightedWord('one', createRange(getTextNode(paragraphOne), 0, 3))
      highlighter.addHighlightedWord('three', createRange(getTextNode(paragraphThree), 0, 5))

      highlighter.clearHighlights()

      expect(container.querySelectorAll('.highlighted-text')).toHaveLength(0)
      expect(paragraphOne.textContent).toBe('one')
      expect(paragraphTwo.textContent).toBe('two')
      expect(paragraphThree.textContent).toBe('three')
      expect(highlighter.getHighlightedWords()).toHaveLength(0)
    })
  })

  // ── getHighlightedWords ─────────────────────────────────────────────────────

  describe('getHighlightedWords', () => {
    it('returns empty array initially', () => {
      expect(highlighter.getHighlightedWords()).toEqual([])
    })

    it('returns the stored word info after adding highlights', () => {
      container.appendChild(document.createTextNode('x'))
      highlighter.addHighlightedWord('x', createRange(getTextNode(container), 0, 1))
      const words = highlighter.getHighlightedWords()
      expect(words).toHaveLength(1)
      expect(words[0]).toMatchObject({ text: 'x', index: 0 })
    })
  })

  // ── updateHighlightStatus ───────────────────────────────────────────────────

  describe('updateHighlightStatus', () => {
    it('updates #highlight-status when the element exists', () => {
      const status = document.createElement('div')
      status.id = 'highlight-status'
      document.body.appendChild(status)

      container.appendChild(document.createTextNode('a'))
      highlighter.addHighlightedWord('a', createRange(getTextNode(container), 0, 1))

      expect(status.textContent).toBe('1 phrase redacted')
      document.body.removeChild(status)
    })

    it('does not throw when #highlight-status is absent', () => {
      container.appendChild(document.createTextNode('a'))
      expect(() => {
        highlighter.addHighlightedWord('a', createRange(getTextNode(container), 0, 1))
      }).not.toThrow()
    })
  })

  // ── onHighlightChange callback ──────────────────────────────────────────────

  describe('onHighlightChange callback', () => {
    it('invokes the callback when a highlight is added', () => {
      const callback = vi.fn()
      highlighter = new TextHighlighter(callback)
      container.appendChild(document.createTextNode('x'))
      highlighter.addHighlightedWord('x', createRange(getTextNode(container), 0, 1))

      expect(callback).toHaveBeenCalledTimes(1)
    })

    it('invokes the callback when undoLastRedaction is called', () => {
      const callback = vi.fn()
      highlighter = new TextHighlighter(callback)
      container.appendChild(document.createTextNode('x'))
      highlighter.addHighlightedWord('x', createRange(getTextNode(container), 0, 1))
      callback.mockClear()

      highlighter.undoLastRedaction()

      expect(callback).toHaveBeenCalledTimes(1)
    })
  })
})
