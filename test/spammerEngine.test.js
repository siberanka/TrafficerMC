import assert from 'assert'
import EventEmitter from 'events'
import {
  generateRandomTag,
  applyMessageConverter,
  applyCustomFormatter,
  getNextMessage,
  sendBotMessage
} from '../src/main/js/misc/spammerEngine.js'

console.log('=== Running Spammer Engine Unit Tests ===')

// 1. generateRandomTag tests
{
  for (let i = 0; i < 20; i++) {
    const tag = generateRandomTag(3, 6)
    assert.ok(tag.length >= 3 && tag.length <= 6, `Tag length ${tag.length} out of bounds (3-6)`)
    assert.match(tag, /^[a-zA-Z0-9]+$/, `Tag contains non-alphanumeric chars: ${tag}`)
  }
  console.log('✓ generateRandomTag (length 3-6 and alphanumeric) passed')
}

// 2. applyMessageConverter tests
{
  // None
  assert.strictEqual(applyMessageConverter('Test Message', 'none'), 'Test Message')

  // Leet
  const leetResult = applyMessageConverter('Test elite game', 'leet')
  assert.strictEqual(leetResult, '7357 3l173 94m3')
  console.log('✓ applyMessageConverter (leet) passed:', leetResult)

  // Random Case
  const rcResult = applyMessageConverter('abcdefghijk', 'random_case')
  assert.strictEqual(rcResult.length, 11)
  assert.strictEqual(rcResult.toLowerCase(), 'abcdefghijk')
  console.log('✓ applyMessageConverter (random_case) passed:', rcResult)

  // Random Space
  const rsResult = applyMessageConverter('hello world', 'random_space')
  assert.ok(rsResult.includes('hello') || rsResult.replace(/\s+/g, '') === 'helloworld')
  console.log('✓ applyMessageConverter (random_space) passed:', rsResult)

  // Command preservation
  const cmdResult = applyMessageConverter('/register test test', 'leet')
  assert.strictEqual(
    cmdResult,
    '/register test test',
    'Commands must not be altered by leet converter'
  )
  console.log('✓ applyMessageConverter command preservation passed')
}

// 3. applyCustomFormatter tests
{
  // Variable replacements
  const replaced = applyCustomFormatter(
    'Hello {player}, time is {time}',
    {},
    { username: 'CoolBot' }
  )
  assert.ok(replaced.includes('Hello CoolBot'))
  assert.ok(!replaced.includes('{player}'))
  assert.ok(!replaced.includes('{time}'))
  console.log('✓ applyCustomFormatter variable replacement passed')

  // Suffix format [rAndOm]
  const suffixFormatted = applyCustomFormatter('Best server ever', {
    customFormatter: true,
    formatterPosition: 'suffix'
  })
  const suffixMatch = suffixFormatted.match(/^Best server ever \[([a-zA-Z0-9]{3,6})\]$/)
  assert.ok(suffixMatch, `Suffix formatted text did not match expected regex: ${suffixFormatted}`)
  console.log('✓ applyCustomFormatter (suffix [rAndOm]) passed:', suffixFormatted)

  // Prefix format [rAndOm]
  const prefixFormatted = applyCustomFormatter('Join now', {
    customFormatter: true,
    formatterPosition: 'prefix'
  })
  const prefixMatch = prefixFormatted.match(/^\[([a-zA-Z0-9]{3,6})\] Join now$/)
  assert.ok(prefixMatch, `Prefix formatted text did not match expected regex: ${prefixFormatted}`)
  console.log('✓ applyCustomFormatter (prefix [rAndOm]) passed:', prefixFormatted)

  // Both format
  const bothFormatted = applyCustomFormatter('Great gameplay', {
    customFormatter: true,
    formatterPosition: 'both'
  })
  const bothMatch = bothFormatted.match(
    /^\[([a-zA-Z0-9]{3,6})\] Great gameplay \[([a-zA-Z0-9]{3,6})\]$/
  )
  assert.ok(bothMatch, `Both formatted text did not match expected regex: ${bothFormatted}`)
  console.log('✓ applyCustomFormatter (both prefix & suffix) passed:', bothFormatted)

  // Commands must NEVER have prefix/suffix tags attached
  const commandFormatted = applyCustomFormatter('/login 123456', {
    customFormatter: true,
    formatterPosition: 'suffix'
  })
  assert.strictEqual(commandFormatted, '/login 123456', 'Command must not have suffix/prefix added')
  console.log('✓ applyCustomFormatter commands never tagged passed')
}

// 4. getNextMessage tests
{
  const messages = ['Message 1', 'Message 2', 'Message 3']
  const state = { index: 0 }

  // Sequence pattern
  assert.strictEqual(getNextMessage(messages, 'sequence', state), 'Message 1')
  assert.strictEqual(getNextMessage(messages, 'sequence', state), 'Message 2')
  assert.strictEqual(getNextMessage(messages, 'sequence', state), 'Message 3')
  assert.strictEqual(getNextMessage(messages, 'sequence', state), 'Message 1')
  console.log('✓ getNextMessage (sequence pattern) passed')

  // Random pattern
  const randomMsg = getNextMessage(messages, 'random')
  assert.ok(messages.includes(randomMsg))
  console.log('✓ getNextMessage (random pattern) passed')
}

// 5. sendBotMessage tests
{
  class MockBot extends EventEmitter {
    constructor() {
      super()
      this.username = 'MockBot'
      this._client = new EventEmitter()
      this._client.username = 'MockBot'
      this._client.state = 'play'
      this.entity = { id: 1 }
      this.chats = []
      this.writes = []
      this._client.write = (packetName, data) => {
        this.writes.push({ packetName, data })
      }
    }
    chat(msg) {
      this.chats.push(msg)
    }
  }

  const bot = new MockBot()

  // Test command sending
  await sendBotMessage(bot, '/help')
  assert.strictEqual(bot.chats.length, 1)
  assert.strictEqual(bot.chats[0], '/help')
  console.log('✓ sendBotMessage command sent via bot.chat passed')

  // Test chat message with Leet and Suffix (bottom spammer scenario)
  await sendBotMessage(bot, 'Hello world', {
    converter: 'leet',
    customFormatter: true,
    formatterPosition: 'suffix'
  })
  assert.strictEqual(bot.chats.length, 2)
  assert.ok(bot.chats[1].startsWith('H3ll0 w0rld ['))
  console.log('✓ sendBotMessage chat with leet + [rAndOm] suffix passed:', bot.chats[1])

  // Test manual single message from top input (options = {}): MUST NOT BE MUTATED OR TAGGED
  await sendBotMessage(bot, 'Hello manual world', {})
  assert.strictEqual(bot.chats.length, 3)
  assert.strictEqual(
    bot.chats[2],
    'Hello manual world',
    'Manual chat from top input must remain 100% pure without tags or converter'
  )
  console.log('✓ sendBotMessage manual chat purity (zero interference) passed')

  // Test manual command even if spam options are passed: COMMANDS MUST NEVER BE TAGGED
  await sendBotMessage(bot, '/msg player hello', {
    converter: 'leet',
    customFormatter: true,
    formatterPosition: 'both'
  })
  assert.strictEqual(bot.chats.length, 4)
  assert.strictEqual(
    bot.chats[3],
    '/msg player hello',
    'Commands must NEVER be tagged or converted under any circumstances'
  )
  console.log('✓ sendBotMessage command immunity from spam tags passed')
}

console.log('=== ALL SPAMMER ENGINE UNIT TESTS PASSED SUCCESSFULLY! ===')
