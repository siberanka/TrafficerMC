import assert from 'assert'
import EventEmitter from 'events'
import { sendBotMessage } from '../src/main/js/misc/spammerEngine.js'

console.log('=== Running Multi-Bot Chat & Spammer Resolution Unit Tests ===')

// 1. Test MockBot and sendBotMessage with onSent attribution
{
  class MockBot extends EventEmitter {
    constructor(name) {
      super()
      this.username = name
      this._client = new EventEmitter()
      this._client.username = name
      this._client.state = 'play'
      this.entity = { id: Math.floor(Math.random() * 1000) }
      this.chats = []
      this._client.write = (packetName, data) => {
        if (packetName === 'chat_message') {
          this.chats.push(data.message)
        } else if (packetName === 'chat_command') {
          this.chats.push('/' + data.command)
        }
      }
    }
    chat(msg) {
      this.chats.push(msg)
    }
  }

  const bot1 = new MockBot('AlphaBot')
  const bot2 = new MockBot('BetaBot')
  const bot3 = new MockBot('GammaBot')

  const activeBots = new Map()
  activeBots.set('AlphaBot', bot1)
  activeBots.set('BetaBot', bot2)
  activeBots.set('GammaBot', bot3)

  function getBot(username) {
    if (!username) return null
    if (activeBots.has(username)) return activeBots.get(username)
    const lower = String(username).toLowerCase().trim()
    for (const [key, bot] of activeBots.entries()) {
      if (
        String(key).toLowerCase().trim() === lower ||
        bot._client?.username?.toLowerCase().trim() === lower ||
        bot.username?.toLowerCase().trim() === lower
      ) {
        return bot
      }
    }
    return null
  }

  function getAllUniqueBots() {
    const bots = []
    const seen = new Set()
    for (const bot of activeBots.values()) {
      if (bot && !seen.has(bot)) {
        seen.add(bot)
        bots.push(bot)
      }
    }
    return bots
  }

  // Test case-insensitive resolution
  assert.strictEqual(getBot('alphabot'), bot1, 'getBot must match case-insensitively')
  assert.strictEqual(getBot('BETABOT '), bot2, 'getBot must handle whitespace and uppercase')
  assert.strictEqual(getBot('GammaBot'), bot3, 'getBot must match exact case')
  assert.strictEqual(getBot('UnknownBot'), null, 'getBot must return null for missing bot')
  console.log('✓ getBot case-insensitive & whitespace resolution passed')

  // Test target resolution with playerList
  const playerList = ['alphabot', 'betabot']
  const targetBots = []
  const seenBots = new Set()
  for (const u of playerList) {
    const b = getBot(u)
    if (b && !seenBots.has(b)) {
      seenBots.add(b)
      targetBots.push(b)
    }
  }
  assert.strictEqual(targetBots.length, 2)
  assert.ok(targetBots.includes(bot1))
  assert.ok(targetBots.includes(bot2))
  console.log('✓ Target bot list extraction from playerList passed')

  // Test fallback to all bots when playerList is empty
  let emptyPlayerList = []
  let fallbackBots = []
  for (const u of emptyPlayerList) {
    const b = getBot(u)
    if (b && !seenBots.has(b)) {
      seenBots.add(b)
      fallbackBots.push(b)
    }
  }
  if (fallbackBots.length === 0) {
    fallbackBots = getAllUniqueBots()
  }
  assert.strictEqual(fallbackBots.length, 3, 'Fallback must resolve all 3 unique bots')
  console.log('✓ Fallback to all connected bots when playerList is empty passed')

  // Test multi-bot message sending with onSent per-bot attribution
  const sentLogs = []
  const testMessage = 'Hello from TrafficerMC multi-bot!'

  for (const bot of targetBots) {
    const botUname = bot._client?.username || bot.username || 'Bot'
    await sendBotMessage(bot, testMessage, {
      customFormatter: true,
      formatterPosition: 'suffix',
      onSent: (formattedMsg) => {
        sentLogs.push({ username: botUname, text: formattedMsg })
      }
    })
  }

  assert.strictEqual(bot1.chats.length, 1, 'bot1 must have received 1 chat')
  assert.strictEqual(bot2.chats.length, 1, 'bot2 must have received 1 chat')
  assert.strictEqual(bot3.chats.length, 0, 'bot3 was not in playerList and must NOT have sent')
  assert.strictEqual(sentLogs.length, 2, 'Two onSent events must be emitted')
  assert.strictEqual(sentLogs[0].username, 'AlphaBot')
  assert.strictEqual(sentLogs[1].username, 'BetaBot')
  assert.ok(sentLogs[0].text.startsWith('Hello from TrafficerMC multi-bot! ['))
  assert.ok(sentLogs[1].text.startsWith('Hello from TrafficerMC multi-bot! ['))
  console.log('✓ Multi-bot message sending with onSent attribution passed:', sentLogs)

  // Test command execution across all bots
  const commandLogs = []
  for (const bot of getAllUniqueBots()) {
    const botUname = bot._client?.username || bot.username || 'Bot'
    await sendBotMessage(bot, '/help', {
      onSent: (formattedCmd) => {
        commandLogs.push({ username: botUname, command: formattedCmd })
      }
    })
  }
  assert.strictEqual(commandLogs.length, 3, 'All 3 bots must execute command')
  assert.strictEqual(bot1.chats[1], '/help')
  assert.strictEqual(bot2.chats[1], '/help')
  assert.strictEqual(bot3.chats[0], '/help')
  console.log('✓ Multi-bot command execution attribution passed')
}

console.log('=== ALL MULTI-BOT CHAT & SPAMMER TESTS PASSED! ===')
process.exit(0)
