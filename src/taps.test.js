import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bucketize, countRecent, mergeTaps } from './taps.js'

test('mergeTaps drops rows already seen', () => {
  const merged = mergeTaps([{ id: 1, at: 10 }], [{ id: 1, at: 99 }, { id: 2, at: 20 }])
  assert.deepEqual(merged, [{ id: 1, at: 10 }, { id: 2, at: 20 }])
})

test('countRecent decays as time passes with no new taps', () => {
  const taps = [{ id: 1, at: 1000 }, { id: 2, at: 6000 }]
  assert.equal(countRecent(taps, 7000, 15_000), 2)
  assert.equal(countRecent(taps, 17_000, 15_000), 1)
  assert.equal(countRecent(taps, 30_000, 15_000), 0)
})

test('bucketize grows with time and ignores out-of-range taps', () => {
  const taps = [{ id: 1, at: 5 }, { id: 2, at: 35 }, { id: 3, at: 36 }, { id: 4, at: -1 }]
  assert.deepEqual(bucketize(taps, 0, 61, 30), [1, 2, 0])
  assert.deepEqual(bucketize([], 0, 0, 30), [0])
})
