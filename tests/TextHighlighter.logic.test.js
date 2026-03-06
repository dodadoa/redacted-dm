// @vitest-environment node
// Tests for the pure internal logic of TextHighlighter.
// No jsdom, no DOM globals — all DOM surface area is replaced by plain stubs.

import { describe, it, expect } from 'vitest'
import { TextHighlighter } from '../src/contentScript/modules/TextHighlighter.js'

// ── Stub builders ─────────────────────────────────────────────────────────────

/** Plain rectangle object (no DOM). */
function rect(left, top, width = 60, height = 20) {
  return { left, top, right: left + width, bottom: top + height, width, height }
}

/** Stub range with getBoundingClientRect. */
function stubRange(rectangle) {
  return {
    getBoundingClientRect: () => rectangle,
    collapsed: false,
  }
}

/** Stub element with getBoundingClientRect. */
function stubElement(elementRect) {
  return {
    getBoundingClientRect: () => elementRect ?? rect(0, 0, 0, 0),
  }
}

/** Build a highlighted-word entry for isAlreadyRedacted tests. */
function makeHighlight(text, elementRect, { segments = null } = {}) {
  const element = stubElement(elementRect ?? rect(10, 10, 60, 20))
  const segs = segments ?? [element]
  return { text, element, segments: segs }
}

// ── Shared instance ───────────────────────────────────────────────────────────

const highlighter = new TextHighlighter()

// ─────────────────────────────────────────────────────────────────────────────
// isAlreadyRedacted — overlap logic (30% threshold, per-segment check)
// ─────────────────────────────────────────────────────────────────────────────

describe('isAlreadyRedacted', () => {
  it('returns false when highlightedWords is empty', () => {
    highlighter.highlightedWords = []
    const range = stubRange(rect(10, 10, 60, 20))
    expect(highlighter.isAlreadyRedacted(range)).toBe(false)
  })

  it('returns true when range overlaps a single-segment highlight by more than 30%', () => {
    highlighter.highlightedWords = [makeHighlight('secret', rect(10, 10, 60, 20))]
    const range = stubRange(rect(10, 10, 60, 20))
    expect(highlighter.isAlreadyRedacted(range)).toBe(true)
  })

  it('returns true when range partially overlaps and overlap exceeds 30% of range area', () => {
    highlighter.highlightedWords = [makeHighlight('x', rect(30, 0, 60, 20))]
    const range = stubRange(rect(0, 0, 60, 20))
    expect(highlighter.isAlreadyRedacted(range)).toBe(true)
  })

  it('returns false when overlap is below 30% of range area', () => {
    highlighter.highlightedWords = [makeHighlight('x', rect(50, 0, 60, 20))]
    const range = stubRange(rect(0, 0, 60, 20))
    expect(highlighter.isAlreadyRedacted(range)).toBe(false)
  })

  it('returns false when range and highlight do not overlap', () => {
    highlighter.highlightedWords = [makeHighlight('x', rect(200, 200, 60, 20))]
    const range = stubRange(rect(10, 10, 60, 20))
    expect(highlighter.isAlreadyRedacted(range)).toBe(false)
  })

  it('checks each segment when highlight has multiple segments', () => {
    const segmentOne = stubElement(rect(10, 10, 60, 20))
    const segmentTwo = stubElement(rect(10, 50, 60, 20))
    highlighter.highlightedWords = [{
      text: 'cross-line',
      element: segmentOne,
      segments: [segmentOne, segmentTwo],
    }]
    const rangeOnLineTwo = stubRange(rect(10, 50, 60, 20))
    expect(highlighter.isAlreadyRedacted(rangeOnLineTwo)).toBe(true)
  })

  it('returns false when range overlaps neither segment of a multi-segment highlight', () => {
    const segmentOne = stubElement(rect(10, 10, 60, 20))
    const segmentTwo = stubElement(rect(10, 50, 60, 20))
    highlighter.highlightedWords = [{
      text: 'cross-line',
      element: segmentOne,
      segments: [segmentOne, segmentTwo],
    }]
    const rangeInGap = stubRange(rect(10, 35, 60, 10))
    expect(highlighter.isAlreadyRedacted(rangeInGap)).toBe(false)
  })

  it('returns true when any of multiple highlights overlaps the range', () => {
    highlighter.highlightedWords = [
      makeHighlight('a', rect(200, 200, 60, 20)),
      makeHighlight('b', rect(10, 10, 60, 20)),
      makeHighlight('c', rect(300, 300, 60, 20)),
    ]
    const range = stubRange(rect(10, 10, 60, 20))
    expect(highlighter.isAlreadyRedacted(range)).toBe(true)
  })

  it('returns false when range.getBoundingClientRect throws', () => {
    highlighter.highlightedWords = [makeHighlight('x', rect(10, 10, 60, 20))]
    const badRange = { getBoundingClientRect: () => { throw new Error('layout fail') } }
    expect(highlighter.isAlreadyRedacted(badRange)).toBe(false)
  })

  it('returns false when segment.getBoundingClientRect throws', () => {
    highlighter.highlightedWords = [{
      text: 'bad',
      element: { getBoundingClientRect: () => { throw new Error() } },
      segments: [{ getBoundingClientRect: () => { throw new Error() } }],
    }]
    const range = stubRange(rect(10, 10, 60, 20))
    expect(highlighter.isAlreadyRedacted(range)).toBe(false)
  })

  it('uses 30% threshold: exactly 30% overlap returns false (strict greater-than)', () => {
    highlighter.highlightedWords = [makeHighlight('x', rect(42, 0, 60, 20))]
    const range = stubRange(rect(0, 0, 60, 20))
    expect(highlighter.isAlreadyRedacted(range)).toBe(false)
  })

  it('uses 30% threshold: slightly above 30% overlap returns true', () => {
    highlighter.highlightedWords = [makeHighlight('x', rect(40, 0, 60, 20))]
    const range = stubRange(rect(0, 0, 60, 20))
    expect(highlighter.isAlreadyRedacted(range)).toBe(true)
  })

  it('handles highlight with segments undefined (falls back to element only)', () => {
    highlighter.highlightedWords = [{
      text: 'legacy',
      element: stubElement(rect(10, 10, 60, 20)),
      segments: undefined,
    }]
    const range = stubRange(rect(10, 10, 60, 20))
    expect(highlighter.isAlreadyRedacted(range)).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// setRedactMode / getRedactMode
// ─────────────────────────────────────────────────────────────────────────────

describe('setRedactMode / getRedactMode', () => {
  it('defaults to free mode', () => {
    const instance = new TextHighlighter()
    expect(instance.getRedactMode()).toBe('free')
  })

  it('stores and returns word mode', () => {
    const instance = new TextHighlighter()
    instance.setRedactMode('word')
    expect(instance.getRedactMode()).toBe('word')
  })

  it('stores and returns free mode', () => {
    const instance = new TextHighlighter()
    instance.setRedactMode('free')
    expect(instance.getRedactMode()).toBe('free')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getHighlightedWords
// ─────────────────────────────────────────────────────────────────────────────

describe('getHighlightedWords', () => {
  it('returns the internal highlightedWords array', () => {
    const instance = new TextHighlighter()
    const stub = { text: 'x', element: {}, segments: [] }
    instance.highlightedWords = [stub]
    expect(instance.getHighlightedWords()).toBe(instance.highlightedWords)
    expect(instance.getHighlightedWords()).toContain(stub)
  })
})
