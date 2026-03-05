// @vitest-environment node
// Tests for the pure internal logic of TextExtractor.
// No jsdom, no DOM globals — all DOM surface area is replaced by plain stubs.

import { describe, it, expect } from 'vitest'
import { TextExtractor } from '../src/contentScript/modules/TextExtractor.js'

// ── Stub builders ─────────────────────────────────────────────────────────────

/** Plain rectangle object (no DOM). */
function rect(left, top, width = 60, height = 20) {
  return { left, top, right: left + width, bottom: top + height, width, height }
}

/** Stub Range: getBoundingClientRect, cloneRange, setEnd, endContainer, endOffset. */
function stubRange(rectangle) {
  return {
    getBoundingClientRect: () => rectangle,
    cloneRange:            () => stubRange(rectangle),
    setEnd:                () => {},
    endContainer:          {},
    endOffset:             0,
  }
}

/**
 * Stub Element with configurable `contains`, `getBoundingClientRect`, `closest`.
 * @param {object} opts
 * @param {function} [opts.contains] - receives the tested element, returns bool
 * @param {object}   [opts.rect]     - bounding rect (default: zero-size)
 * @param {function} [opts.closest]  - return value of closest() (default: null)
 */
function stubElement({ contains = () => false, rect: elementRect = rect(0, 0, 0, 0), closest = () => null } = {}) {
  return { contains, getBoundingClientRect: () => elementRect, closest }
}

/** Build a word entry ready for use as TextExtractor input/output. */
function makeWord(text, wordRect, { isRedacted = false, matchedRedacted = null, element = null } = {}) {
  return { text, range: stubRange(wordRect), element: element ?? stubElement(), isRedacted, matchedRedacted }
}

// ── Shared instance (stateless helpers; no shared state between tests) ────────

const extractor = new TextExtractor()

// ─────────────────────────────────────────────────────────────────────────────
// _wordInArea
// ─────────────────────────────────────────────────────────────────────────────

describe('_wordInArea', () => {
  // area at x:100, y:50, width:200, height:100  (anchor at viewport origin)
  const area       = { x: 100, y: 50, width: 200, height: 100 }
  const anchorRect = rect(0, 0, 800, 600) // anchor at origin → relative coords equal viewport coords

  it('returns true when word centre is inside the area', () => {
    // word at (110, 60) width:40 height:20 → centre (130, 70) — inside [100–300, 50–150]
    expect(extractor._wordInArea(rect(110, 60, 40, 20), anchorRect, area)).toBe(true)
  })

  it('returns false when word centre is outside and word does not overlap', () => {
    // word entirely to the left — right edge at 90, area.x = 100
    expect(extractor._wordInArea(rect(10, 60, 80, 20), anchorRect, area)).toBe(false)
  })

  it('returns true when word straddles the left edge (overlap fallback)', () => {
    // word left:70 width:40 → centre at 90 (outside), right at 110 (crosses area boundary)
    expect(extractor._wordInArea(rect(70, 60, 40, 20), anchorRect, area)).toBe(true)
  })

  it('returns true when word straddles the right edge (overlap fallback)', () => {
    // area right = 300; word left:280 width:40 → centre at 300, right at 320
    expect(extractor._wordInArea(rect(280, 60, 40, 20), anchorRect, area)).toBe(true)
  })

  it('returns false when word is entirely below the area', () => {
    // area bottom = 150; word top = 160
    expect(extractor._wordInArea(rect(150, 160, 40, 20), anchorRect, area)).toBe(false)
  })

  it('returns false when word is entirely above the area', () => {
    // area top = 50; word bottom = 30
    expect(extractor._wordInArea(rect(150, 5, 40, 20), anchorRect, area)).toBe(false)
  })

  it('returns true when word exactly covers the area centre', () => {
    expect(extractor._wordInArea(rect(190, 90, 20, 20), anchorRect, area)).toBe(true)
  })

  it('accounts for a non-zero anchor offset', () => {
    // anchor starts at viewport (50, 30); the same logical word (relLeft=110, relTop=60)
    // now lives at viewport position (160, 90)
    const anchorWithOffset = rect(50, 30, 800, 600)
    expect(extractor._wordInArea(rect(160, 90, 40, 20), anchorWithOffset, area)).toBe(true)
  })

  it('returns false when word is right-adjacent to the area but does not overlap', () => {
    // area right = 300; word left = 301 — just outside
    expect(extractor._wordInArea(rect(301, 60, 40, 20), anchorRect, area)).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// _matchesHighlight
// ─────────────────────────────────────────────────────────────────────────────

describe('_matchesHighlight', () => {
  it('returns true when word.element IS the highlight element (identity)', () => {
    const element   = stubElement()
    const word      = { element }
    const highlight = { element }
    expect(extractor._matchesHighlight(word, rect(10, 10), highlight)).toBe(true)
  })

  it('returns true when highlight.element.contains(word.element)', () => {
    const wordElement      = stubElement()
    const highlightElement = stubElement({ contains: () => true })
    expect(extractor._matchesHighlight(
      { element: wordElement }, rect(10, 10), { element: highlightElement }
    )).toBe(true)
  })

  it('returns true when rect overlap exceeds 30% of word area', () => {
    const wordElement      = stubElement()
    // word rect and highlight rect are identical → 100% overlap
    const wordRect         = rect(10, 10, 60, 20)
    const highlightElement = stubElement({ rect: rect(10, 10, 60, 20) })
    expect(extractor._matchesHighlight(
      { element: wordElement }, wordRect, { element: highlightElement }
    )).toBe(true)
  })

  it('returns true when highlight rect partially overlaps more than 30%', () => {
    // word  0–60 × 0–20  (area = 1200)
    // highlight 30–90 × 0–20 → overlap 30×20 = 600  >  1200 × 0.3 = 360
    const wordElement      = stubElement()
    const highlightElement = stubElement({ rect: rect(30, 0, 60, 20) })
    expect(extractor._matchesHighlight(
      { element: wordElement }, rect(0, 0, 60, 20), { element: highlightElement }
    )).toBe(true)
  })

  it('returns false when rect overlap is below 30%', () => {
    // word  0–60 × 0–20  (area = 1200)
    // highlight 50–110 × 0–20 → overlap 10×20 = 200  <  360
    const wordElement      = stubElement()
    const highlightElement = stubElement({ rect: rect(50, 0, 60, 20) })
    expect(extractor._matchesHighlight(
      { element: wordElement }, rect(0, 0, 60, 20), { element: highlightElement }
    )).toBe(false)
  })

  it('returns false when there is no containment and no overlap', () => {
    const wordElement      = stubElement()
    const highlightElement = stubElement({ rect: rect(200, 0, 60, 20) })
    expect(extractor._matchesHighlight(
      { element: wordElement }, rect(0, 0, 60, 20), { element: highlightElement }
    )).toBe(false)
  })

  it('returns false and swallows errors thrown by highlight.element.contains', () => {
    const wordElement      = stubElement()
    const highlightElement = {
      contains:              () => { throw new Error('DOM error') },
      getBoundingClientRect: () => rect(0, 0, 0, 0),
    }
    expect(extractor._matchesHighlight(
      { element: wordElement }, rect(0, 0, 60, 20), { element: highlightElement }
    )).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// _sortByPosition
// ─────────────────────────────────────────────────────────────────────────────

describe('_sortByPosition', () => {
  it('leaves an already-sorted list unchanged', () => {
    const words = [makeWord('a', rect(0, 0)), makeWord('b', rect(50, 0)), makeWord('c', rect(100, 0))]
    extractor._sortByPosition(words)
    expect(words.map(word => word.text)).toEqual(['a', 'b', 'c'])
  })

  it('sorts top-to-bottom when vertical difference exceeds 5 px', () => {
    const words = [makeWord('c', rect(0, 100)), makeWord('a', rect(0, 0)), makeWord('b', rect(0, 50))]
    extractor._sortByPosition(words)
    expect(words.map(word => word.text)).toEqual(['a', 'b', 'c'])
  })

  it('sorts left-to-right when vertical gap is within 5 px (same line)', () => {
    // vertical gap = 2 px ≤ 5 px → treated as same line → sort by left
    const words = [makeWord('right', rect(100, 10)), makeWord('left', rect(10, 12))]
    extractor._sortByPosition(words)
    expect(words.map(word => word.text)).toEqual(['left', 'right'])
  })

  it('treats a vertical gap of exactly 5 px as the same line', () => {
    const words = [makeWord('right', rect(80, 5)), makeWord('left', rect(10, 0))]
    extractor._sortByPosition(words)
    expect(words.map(word => word.text)).toEqual(['left', 'right'])
  })

  it('treats a vertical gap of 6 px as different rows and sorts by top', () => {
    const words = [makeWord('lower', rect(0, 6)), makeWord('upper', rect(100, 0))]
    extractor._sortByPosition(words)
    expect(words.map(word => word.text)).toEqual(['upper', 'lower'])
  })

  it('does not throw when getBoundingClientRect raises an error', () => {
    const badWord = { text: 'x', range: { getBoundingClientRect: () => { throw new Error() } } }
    const okWord  = makeWord('y', rect(0, 0))
    expect(() => extractor._sortByPosition([badWord, okWord])).not.toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// _markRedacted
// ─────────────────────────────────────────────────────────────────────────────

describe('_markRedacted', () => {
  it('leaves isRedacted false when no highlights are provided', () => {
    const word = makeWord('hello', rect(0, 0))
    extractor._markRedacted([word], [])
    expect(word.isRedacted).toBe(false)
    expect(word.matchedRedacted).toBe(null)
  })

  it('sets isRedacted true and assigns matchedRedacted when a highlight matches', () => {
    const highlightElement = stubElement({ contains: () => true })
    const highlight        = { element: highlightElement }
    const word             = makeWord('hello', rect(10, 10))
    extractor._markRedacted([word], [highlight])
    expect(word.isRedacted).toBe(true)
    expect(word.matchedRedacted).toBe(highlight)
  })

  it('prefers the outermost match when multiple highlights match', () => {
    const innerElement = stubElement()
    // outerElement contains innerElement — so outerHighlight is the outermost match
    const outerElement = stubElement({ contains: (element) => element === innerElement })
    const outerHighlight = { element: outerElement }
    const innerHighlight = { element: innerElement }

    // word.element === innerElement → both highlights match:
    //   innerHighlight via identity, outerHighlight via outerElement.contains(innerElement)
    const word = makeWord('nested', rect(5, 5), { element: innerElement })
    extractor._markRedacted([word], [outerHighlight, innerHighlight])

    // outerHighlight is NOT contained by any other match → selected as outermost
    expect(word.matchedRedacted).toBe(outerHighlight)
  })

  it('falls back to isRedacted false when range.getBoundingClientRect throws', () => {
    const word = {
      text:    'crash',
      range:   { getBoundingClientRect: () => { throw new Error('layout fail') } },
      element: stubElement(),
    }
    extractor._markRedacted([word], [{ element: stubElement({ contains: () => true }) }])
    expect(word.isRedacted).toBe(false)
    expect(word.matchedRedacted).toBe(null)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// _mergeGroups
// ─────────────────────────────────────────────────────────────────────────────

describe('_mergeGroups', () => {
  it('passes a plain word through unchanged (same reference)', () => {
    const word   = makeWord('hello', rect(0, 0))
    const result = extractor._mergeGroups([word])
    expect(result).toHaveLength(1)
    expect(result[0]).toBe(word)
  })

  it('passes a single-word redacted entry through unchanged (same reference)', () => {
    const phrase = {}
    const word   = makeWord('secret', rect(0, 0), { isRedacted: true, matchedRedacted: phrase })
    const result = extractor._mergeGroups([word])
    expect(result).toHaveLength(1)
    expect(result[0]).toBe(word)
  })

  it('merges a two-word phrase into one beat with joined text', () => {
    const phrase = {}
    const words  = [
      makeWord('hello', rect(0,  0), { isRedacted: true, matchedRedacted: phrase }),
      makeWord('world', rect(60, 0), { isRedacted: true, matchedRedacted: phrase }),
    ]
    const result = extractor._mergeGroups(words)
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('hello world')
    expect(result[0].isRedacted).toBe(true)
  })

  it('merges a three-word phrase into one beat', () => {
    const phrase = {}
    const words  = ['a', 'b', 'c'].map((text, index) =>
      makeWord(text, rect(index * 60, 0), { isRedacted: true, matchedRedacted: phrase })
    )
    const result = extractor._mergeGroups(words)
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('a b c')
  })

  it('emits each phrase only once regardless of how many words share it', () => {
    const phrase = {}
    const words  = ['x', 'y', 'z'].map((text, index) =>
      makeWord(text, rect(index * 60, 0), { isRedacted: true, matchedRedacted: phrase })
    )
    const result = extractor._mergeGroups(words)
    expect(result.filter(word => word.isRedacted)).toHaveLength(1)
  })

  it('keeps two independent phrases as separate beats', () => {
    const phraseOne = {}
    const phraseTwo = {}
    const words = [
      makeWord('hello', rect(0,   0), { isRedacted: true, matchedRedacted: phraseOne }),
      makeWord('world', rect(60,  0), { isRedacted: true, matchedRedacted: phraseOne }),
      makeWord('foo',   rect(120, 0), { isRedacted: true, matchedRedacted: phraseTwo }),
      makeWord('bar',   rect(180, 0), { isRedacted: true, matchedRedacted: phraseTwo }),
    ]
    const result = extractor._mergeGroups(words)
    expect(result).toHaveLength(2)
    expect(result[0].text).toBe('hello world')
    expect(result[1].text).toBe('foo bar')
  })

  it('preserves document order across plain and redacted entries', () => {
    const phrase = {}
    const words = [
      makeWord('before', rect(0,   0)),
      makeWord('red',    rect(60,  0), { isRedacted: true, matchedRedacted: phrase }),
      makeWord('act',    rect(120, 0), { isRedacted: true, matchedRedacted: phrase }),
      makeWord('after',  rect(200, 0)),
    ]
    expect(extractor._mergeGroups(words).map(word => word.text)).toEqual(['before', 'red act', 'after'])
  })

  it('skips a redacted word whose matchedRedacted is null', () => {
    const word = makeWord('orphan', rect(0, 0), { isRedacted: true, matchedRedacted: null })
    expect(extractor._mergeGroups([word])).toHaveLength(0)
  })

  it('uses the .highlighted-text ancestor as the merged element when present', () => {
    const highlightSpan = stubElement({ closest: (selector) => selector === '.highlighted-text' ? highlightSpan : null })
    const phrase        = {}
    const words         = [
      makeWord('a', rect(0,  0), { isRedacted: true, matchedRedacted: phrase, element: highlightSpan }),
      makeWord('b', rect(60, 0), { isRedacted: true, matchedRedacted: phrase, element: highlightSpan }),
    ]
    const result = extractor._mergeGroups(words)
    expect(result[0].element).toBe(highlightSpan)
  })
})
