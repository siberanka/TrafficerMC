import assert from 'node:assert/strict'
import {
  DEFAULT_REJOIN_DELAY_MIN,
  DEFAULT_REJOIN_DELAY_MAX,
  MIN_REJOIN_DELAY,
  MAX_REJOIN_DELAY,
  getRandomRejoinDelay,
  normalizeRejoinRange
} from '../src/main/js/misc/reconnectPolicy.js'

assert.deepEqual(normalizeRejoinRange(), {
  min: DEFAULT_REJOIN_DELAY_MIN,
  max: DEFAULT_REJOIN_DELAY_MAX
})
assert.deepEqual(normalizeRejoinRange({ reconnectDelayMin: 20000, reconnectDelayMax: 5000 }), {
  min: 5000,
  max: 20000
})
assert.deepEqual(normalizeRejoinRange({ reconnectDelayMin: -5, reconnectDelayMax: 999999 }), {
  min: MIN_REJOIN_DELAY,
  max: MAX_REJOIN_DELAY
})
assert.equal(
  getRandomRejoinDelay({ reconnectDelayMin: 8000, reconnectDelayMax: 15000 }, () => 0),
  8000
)
assert.equal(
  getRandomRejoinDelay({ reconnectDelayMin: 8000, reconnectDelayMax: 15000 }, () => 1),
  15000
)
for (let index = 0; index < 1000; index++) {
  const value = getRandomRejoinDelay({ reconnectDelayMin: 8000, reconnectDelayMax: 15000 })
  assert.ok(value >= 8000 && value <= 15000)
}

console.log('PASS reconnect policy: defaults, validation, swapped range, and random bounds')
