import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { getNextMessage } from '../src/main/js/misc/spammerEngine.js'

console.log(`=== Testing Spammer Defaults & Optimization Architecture ===`)

// Test 1: Empty Spammer Messages
console.log('--- Test 1: Empty Spammer Messages Behavior ---')
assert.strictEqual(getNextMessage([], 'random'), '', 'Empty array must return empty string')
assert.strictEqual(
  getNextMessage([], 'sequence'),
  '',
  'Empty array sequence must return empty string'
)
assert.strictEqual(getNextMessage(null, 'random'), '', 'Null array must return empty string')
assert.strictEqual(
  getNextMessage(undefined, 'random'),
  '',
  'Undefined array must return empty string'
)
console.log('✓ Spammer engine handles empty/null messages array safely')

// Test 2: Verify zero hardcoded promo spammer messages in src
console.log('--- Test 2: Verify default spammer messages removed from source files ---')
const mainIndexSrc = fs.readFileSync(path.resolve('src/main/index.js'), 'utf-8')
const rendererIndexSrc = fs.readFileSync(path.resolve('src/renderer/src/index.js'), 'utf-8')

assert.ok(
  rendererIndexSrc.includes('let spammerMessages = []'),
  'Renderer must initialize spammerMessages as empty array []'
)
assert.ok(
  mainIndexSrc.includes('config.value.spammerMessages = []'),
  'Main migrateConfig must initialize spammerMessages as empty array []'
)
assert.ok(
  !rendererIndexSrc.includes('daha kaliteli bi oyun deneyimi'),
  'Renderer must not contain default promo message'
)
assert.ok(
  !rendererIndexSrc.includes('simit parasına açılmış'),
  'Renderer must not contain default promo message'
)
console.log('✓ Default spammer promo messages successfully removed from source files')

// Test 3: Anti-AFK pacing verification
console.log('--- Test 3: Verify Anti-AFK async pacing & interval cleanup ---')
const antiafkSrc = fs.readFileSync(path.resolve('src/main/js/misc/antiafk.js'), 'utf-8')
assert.ok(
  antiafkSrc.includes('delayMs') || antiafkSrc.includes('Pacing delay'),
  'Anti-AFK must include pacing delay between actions'
)
assert.ok(antiafkSrc.includes('clearInterval'), 'Anti-AFK stop() must clear polling timer')
console.log('✓ Anti-AFK async pacing & timer cleanup verified')

// Test 4: ProxyCheck timeout timer cleanup
console.log('--- Test 4: Verify ProxyCheck timer cleanup ---')
const proxycheckSrc = fs.readFileSync(path.resolve('src/main/js/proxy/proxycheck.js'), 'utf-8')
assert.ok(
  proxycheckSrc.includes('clearTimeout(timer)'),
  'Proxy check must clear timeout timer on success and error'
)
console.log('✓ ProxyCheck timer cleanup verified')

console.log(`\n=== ALL SPAMMER DEFAULTS & OPTIMIZATION TESTS PASSED! ===\n`)
