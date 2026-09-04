import assert from 'assert'
import { resolveBotVersion } from '../src/main/js/misc/versionResolver.js'

console.log('--- Testing resolveBotVersion ---')

// 1. Never downgrade across different protocol numbers.
assert.strictEqual(resolveBotVersion('26.2'), undefined, '26.2 must not masquerade as 26.1')
assert.strictEqual(resolveBotVersion('26.1'), '26.1', '26.1 should resolve to 26.1')
assert.strictEqual(resolveBotVersion('26.0'), undefined, 'Nonexistent 26.0 must be rejected')

// 2. 1.21.x versions
assert.strictEqual(resolveBotVersion('1.21.11'), '1.21.11', '1.21.11 should resolve to 1.21.11')
assert.strictEqual(
  resolveBotVersion('1.21.10'),
  '1.21.9',
  '1.21.10 should resolve to nearest 1.21.9'
)
assert.strictEqual(resolveBotVersion('1.21.9'), '1.21.9', '1.21.9 should resolve to 1.21.9')
assert.strictEqual(resolveBotVersion('1.21.8'), '1.21.8', '1.21.8 should resolve to 1.21.8')
assert.strictEqual(
  resolveBotVersion('1.21.7'),
  '1.21.8',
  '1.21.7 should resolve to protocol-equivalent 1.21.8'
)
assert.strictEqual(resolveBotVersion('1.21.6'), '1.21.6', '1.21.6 should resolve to 1.21.6')
assert.strictEqual(resolveBotVersion('1.21.4'), '1.21.4', '1.21.4 should resolve to 1.21.4')

// 3. Older aliases and protocol-equivalent releases
assert.strictEqual(resolveBotVersion('1.20.4'), '1.20.4', '1.20.4 should remain 1.20.4')
assert.strictEqual(resolveBotVersion('1.20.3'), '1.20.4', '1.20.3 shares the 1.20.4 protocol')
assert.strictEqual(resolveBotVersion('1.8.9'), '1.8.8', 'PvP label 1.8.9 should use 1.8.8')
assert.strictEqual(resolveBotVersion(''), undefined, 'Empty string should return undefined')
assert.strictEqual(resolveBotVersion(null), undefined, 'Null should return undefined')

console.log('✓ All resolveBotVersion tests passed successfully!')
