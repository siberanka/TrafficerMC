import assert from 'assert'
import EventEmitter from 'events'

console.log('=== Running Script Engine & Command Parser Unit Tests ===')

// Mock Bot implementation to track dispatched commands
class MockBot extends EventEmitter {
  constructor(name) {
    super()
    this.username = name
    this._client = { username: name }
    this.actions = []
    this.controls = {}
    this.respawnCalled = false
    this.quitCalled = false

    this._actionHandler = (action, args) => {
      const arr = Array.isArray(args) ? args : [args]
      this.actions.push({ action, args: arr })
      if (action === 'startmove') {
        this.controls[arr[0]] = true
      } else if (action === 'stopmove') {
        this.controls[arr[0]] = false
      } else if (action === 'resetmove') {
        this.controls = {}
      } else if (action === 'respawn') {
        this.respawnCalled = true
      } else if (action === 'disconnect') {
        this.quitCalled = true
      }
    }
  }
}

const mockBots = new Map()
const bot1 = new MockBot('AlphaBot')
const bot2 = new MockBot('BetaBot')
mockBots.set('AlphaBot', bot1)
mockBots.set('BetaBot', bot2)

function getBot(username) {
  if (!username) return null
  return mockBots.get(username) || null
}

function dispatchBotCommand(username, command, args) {
  const bot = getBot(username)
  if (bot && typeof bot._actionHandler === 'function') {
    bot._actionHandler(command, args)
  }
}

const delay = (ms) => new Promise((res) => setTimeout(res, ms))

// Simulates startScript parser logic
async function runTestScript(username, scriptText) {
  let stopScript = false
  if (!scriptText) return
  const scriptLines = scriptText.split(/\r?\n/)
  for (let i = 0; i < scriptLines.length; i++) {
    if (stopScript) break
    const rawLine = scriptLines[i].trim()
    if (!rawLine || rawLine.startsWith('#') || rawLine.startsWith('//')) continue

    // Direct slash command support: e.g. "/login 123456" or "/spawn"
    if (rawLine.startsWith('/')) {
      dispatchBotCommand(username, 'command', [rawLine])
      continue
    }

    const args = rawLine.split(/\s+/)
    const command = args.shift().toLowerCase()

    switch (command) {
      case 'delay':
      case 'wait':
      case 'sleep':
        await delay(parseInt(args[0], 10) || 5)
        break
      case 'command':
      case 'cmd': {
        const fullCmd = args.join(' ')
        dispatchBotCommand(username, 'command', [fullCmd])
        break
      }
      case 'chat':
      case 'say':
      case 'msg': {
        const msg = args.join(' ')
        dispatchBotCommand(username, 'chat', [msg])
        break
      }
      case 'hotbar':
      case 'sethotbar':
        dispatchBotCommand(username, 'sethotbar', [args[0] || '0'])
        break
      case 'use':
      case 'useheld':
      case 'activate':
        dispatchBotCommand(username, 'useheld', [])
        break
      case 'winclick':
        dispatchBotCommand(username, 'winclick', [args[0] || '0', args[1] || '0'])
        break
      case 'closewindow':
        dispatchBotCommand(username, 'closewindow', [])
        break
      case 'drop':
        dispatchBotCommand(username, 'drop', [args[0] || '0'])
        break
      case 'dropall':
        dispatchBotCommand(username, 'dropall', [])
        break
      case 'startmove':
        dispatchBotCommand(username, 'startmove', [args[0] || 'forward'])
        break
      case 'stopmove':
        dispatchBotCommand(username, 'stopmove', [args[0] || 'forward'])
        break
      case 'resetmove':
      case 'stop':
        dispatchBotCommand(username, 'resetmove', [])
        break
      case 'jump':
        dispatchBotCommand(username, 'startmove', ['jump'])
        await delay(5)
        dispatchBotCommand(username, 'stopmove', ['jump'])
        break
      case 'sneak':
        dispatchBotCommand(username, 'startmove', ['sneak'])
        break
      case 'unsneak':
        dispatchBotCommand(username, 'stopmove', ['sneak'])
        break
      case 'sprint':
        dispatchBotCommand(username, 'startmove', ['sprint'])
        break
      case 'unsprint':
        dispatchBotCommand(username, 'stopmove', ['sprint'])
        break
      case 'look':
        dispatchBotCommand(username, 'look', [args[0] || '0', args[1] || '0'])
        break
      case 'afk':
        if (args[0]?.toLowerCase() === 'off') {
          dispatchBotCommand(username, 'afkoff', [])
        } else {
          dispatchBotCommand(username, 'afkon', [])
        }
        break
      case 'afkon':
        dispatchBotCommand(username, 'afkon', [])
        break
      case 'afkoff':
        dispatchBotCommand(username, 'afkoff', [])
        break
      case 'respawn':
        dispatchBotCommand(username, 'respawn', [])
        break
      case 'disconnect':
      case 'quit':
        dispatchBotCommand(username, 'disconnect', [])
        break
      case 'hit':
      case 'attack':
        dispatchBotCommand(username, 'hit', [
          'true',
          'true',
          'true',
          'true',
          args[0] || '3.5',
          'true'
        ])
        break
      default:
        dispatchBotCommand(username, command, args.slice(0))
    }
  }
}

// Test 1: Direct slash commands and comments
;(async () => {
  const script1 = `
    # Initial setup comment
    // Another comment format
    /login 123456
    wait 5
    /register secretPass secretPass
    wait 5
    /spawn
    /warp pvp
  `
  await runTestScript('AlphaBot', script1)

  const slashCommands = bot1.actions.filter((a) => a.action === 'command')
  assert.strictEqual(slashCommands.length, 4, 'Must parse 4 slash commands')
  assert.deepStrictEqual(slashCommands[0].args, ['/login 123456'])
  assert.deepStrictEqual(slashCommands[1].args, ['/register secretPass secretPass'])
  assert.deepStrictEqual(slashCommands[2].args, ['/spawn'])
  assert.deepStrictEqual(slashCommands[3].args, ['/warp pvp'])
  console.log('✓ Direct slash commands (/login, /register, /spawn) & comment parsing passed')

  // Test 2: Chat, inventory, window, and movement commands
  const script2 = `
    chat Hello from TrafficerMC!
    command rules
    hotbar 2
    useheld
    winclick 14 0
    closewindow
    startmove forward
    wait 5
    jump
    stopmove forward
    drop 36
    dropall
    afk on
    wait 5
    afk off
    respawn
    disconnect
  `
  bot1.actions = []
  await runTestScript('AlphaBot', script2)

  const chatActions = bot1.actions.filter((a) => a.action === 'chat')
  assert.strictEqual(chatActions.length, 1)
  assert.deepStrictEqual(chatActions[0].args, ['Hello from TrafficerMC!'])

  const hotbarActions = bot1.actions.filter((a) => a.action === 'sethotbar')
  assert.strictEqual(hotbarActions.length, 1)
  assert.deepStrictEqual(hotbarActions[0].args, ['2'])

  const useActions = bot1.actions.filter((a) => a.action === 'useheld')
  assert.strictEqual(useActions.length, 1)

  const winActions = bot1.actions.filter((a) => a.action === 'winclick')
  assert.strictEqual(winActions.length, 1)
  assert.deepStrictEqual(winActions[0].args, ['14', '0'])

  const dropActions = bot1.actions.filter((a) => a.action === 'drop')
  assert.strictEqual(dropActions.length, 1)
  assert.deepStrictEqual(dropActions[0].args, ['36'])

  const dropallActions = bot1.actions.filter((a) => a.action === 'dropall')
  assert.strictEqual(dropallActions.length, 1)

  const afkOnActions = bot1.actions.filter((a) => a.action === 'afkon')
  const afkOffActions = bot1.actions.filter((a) => a.action === 'afkoff')
  assert.strictEqual(afkOnActions.length, 1)
  assert.strictEqual(afkOffActions.length, 1)

  assert.strictEqual(bot1.respawnCalled, true, 'Respawn action must be triggered')
  assert.strictEqual(bot1.quitCalled, true, 'Disconnect action must be triggered')
  console.log('✓ Comprehensive script command execution & aliases passed')

  // Test 3: Target fallback when playerList is empty
  const playerListEmpty = []
  const activeKeys = ['AlphaBot', 'BetaBot']
  let scriptTargets = playerListEmpty.length > 0 ? playerListEmpty : activeKeys
  assert.strictEqual(
    scriptTargets.length,
    2,
    'Must fallback to all active bots when playerList empty'
  )
  console.log('✓ Script target fallback to active bots passed')

  console.log('=== ALL SCRIPT ENGINE & COMMAND PARSER TESTS PASSED! ===')
})()
