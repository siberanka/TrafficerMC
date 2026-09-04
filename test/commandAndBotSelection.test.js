import assert from 'assert'
import mc from 'minecraft-protocol'
import mineflayer from 'mineflayer'
import minecraftData from 'minecraft-data'
import { sendBotMessage } from '../src/main/js/misc/spammerEngine.js'

console.log('===============================================================')
console.log(' Comprehensive Bot Selection & Message Delivery Test Suite')
console.log('===============================================================')

// Helper for delay
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Simulated main process bot resolver logic matching src/main/index.js
function createBotResolver(activeBotsMap) {
  let playerList = []

  function setPlayerList(list) {
    playerList = Array.isArray(list) ? list.map((n) => String(n).trim()).filter(Boolean) : []
  }

  function getBot(username) {
    if (!username) return null
    if (activeBotsMap.has(username)) return activeBotsMap.get(username)
    const lower = String(username).toLowerCase().trim()
    for (const [key, bot] of activeBotsMap.entries()) {
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
    for (const bot of activeBotsMap.values()) {
      if (bot && !seen.has(bot)) {
        seen.add(bot)
        bots.push(bot)
      }
    }
    return bots
  }

  function resolveTargetBots(explicitTargets = null) {
    const targets = []
    const seen = new Set()

    let rawTargets = null
    if (explicitTargets) {
      rawTargets = Array.isArray(explicitTargets) ? explicitTargets : [explicitTargets]
    } else if (playerList && playerList.length > 0) {
      rawTargets = playerList
    } else {
      return getAllUniqueBots()
    }

    for (const u of rawTargets) {
      const b = getBot(u)
      if (b && !seen.has(b)) {
        seen.add(b)
        targets.push(b)
      }
    }

    if (targets.length === 0) {
      return getAllUniqueBots()
    }

    return targets
  }

  return { setPlayerList, resolveTargetBots, getBot, getAllUniqueBots }
}

// -------------------------------------------------------------
// TEST SUITE 1: Modern Minecraft 1.20.4 Server (Selective vs All)
// -------------------------------------------------------------
{
  console.log('\n--- Test Suite 1: Modern 1.20.4 Protocol Multi-Bot Dispatch ---')
  const PORT = 25580
  const VERSION = '1.20.4'
  const mcData = minecraftData(VERSION)

  const server = mc.createServer({
    'online-mode': false,
    host: '127.0.0.1',
    port: PORT,
    version: VERSION
  })

  const serverReceivedPackets = []

  server.on('playerJoin', (client) => {
    client.write('login', { ...mcData.loginPacket, entityId: client.id })
    client.write('update_health', { health: 20, food: 20, foodSaturation: 5 })
    setTimeout(() => {
      client.write('position', { x: 0, y: 64, z: 0, yaw: 0, pitch: 0, flags: 0, teleportId: 1 })
    }, 50)

    client.on('packet', (data, meta) => {
      if (meta.name === 'chat_command') {
        serverReceivedPackets.push({
          bot: client.username,
          type: 'command',
          content: '/' + data.command
        })
      } else if (meta.name === 'chat_message') {
        serverReceivedPackets.push({
          bot: client.username,
          type: 'chat',
          content: data.message
        })
      }
    })
  })

  await new Promise((res) => server.once('listening', res))
  console.log(`✓ 1.20.4 Mock Server running on 127.0.0.1:${PORT}`)

  // Create 5 bots
  const botMap = new Map()
  const botList = []
  for (let i = 1; i <= 5; i++) {
    const uname = `Agent_${i}`
    const b = mineflayer.createBot({
      host: '127.0.0.1',
      port: PORT,
      username: uname,
      version: VERSION,
      hideErrors: true
    })
    botMap.set(uname, b)
    botList.push(b)
  }

  await Promise.all(botList.map((b) => new Promise((res) => b.once('spawn', res))))
  console.log(`✓ 5 bots successfully connected & spawned on 1.20.4 server`)

  const resolver = createBotResolver(botMap)

  // Step 1.1: Selective Targeting (Only Agent_2 and Agent_4 selected)
  console.log('Testing selective bot dispatch (Agent_2 & Agent_4 only)...')
  resolver.setPlayerList(['Agent_2', 'Agent_4'])
  let selected = resolver.resolveTargetBots()
  assert.strictEqual(selected.length, 2, `Expected 2 bots selected, got ${selected.length}`)

  serverReceivedPackets.length = 0
  for (const bot of selected) {
    await sendBotMessage(bot, '/register testpass123 testpass123')
  }
  await delay(400)

  assert.strictEqual(
    serverReceivedPackets.length,
    2,
    `Expected 2 packets received, got ${serverReceivedPackets.length}`
  )
  const receivedBots = serverReceivedPackets.map((p) => p.bot).sort()
  assert.deepStrictEqual(receivedBots, ['Agent_2', 'Agent_4'])
  console.log('✓ Selective bot dispatch verified 100% accurate:', serverReceivedPackets)

  // Step 1.2: Select All Targeting (All 5 bots selected)
  console.log('Testing Select All dispatch (all 5 bots)...')
  resolver.setPlayerList(['Agent_1', 'Agent_2', 'Agent_3', 'Agent_4', 'Agent_5'])
  selected = resolver.resolveTargetBots()
  assert.strictEqual(selected.length, 5, `Expected 5 bots selected, got ${selected.length}`)

  serverReceivedPackets.length = 0
  for (const bot of selected) {
    await sendBotMessage(bot, '/login testpass123')
    await delay(50) // Stagger pacing
  }
  await delay(500)

  assert.strictEqual(
    serverReceivedPackets.length,
    5,
    `Expected 5 packets received, got ${serverReceivedPackets.length}`
  )
  assert.strictEqual(
    new Set(serverReceivedPackets.map((p) => p.bot)).size,
    5,
    'All 5 unique bots received command'
  )
  console.log('✓ Select All bot command dispatch verified 100% receipt')

  // Step 1.3: Regular chat message with custom formatting across all bots
  serverReceivedPackets.length = 0
  for (let i = 0; i < selected.length; i++) {
    const bot = selected[i]
    await sendBotMessage(bot, 'Hello Server from TrafficerMC', {
      customFormatter: true,
      formatterPosition: 'suffix'
    })
    await delay(50)
  }
  await delay(500)

  assert.strictEqual(
    serverReceivedPackets.length,
    5,
    `Expected 5 chat messages received, got ${serverReceivedPackets.length}`
  )
  for (const p of serverReceivedPackets) {
    assert.strictEqual(p.type, 'chat')
    assert.ok(p.content.startsWith('Hello Server from TrafficerMC ['), 'Tag properly applied')
  }
  console.log('✓ Regular chat with anti-spam tags verified on 1.20.4')

  botList.forEach((b) => b.end())
  server.close()
}

// -------------------------------------------------------------
// TEST SUITE 2: Legacy Minecraft 1.12.2 Server (Pre-1.19 Protocol)
// -------------------------------------------------------------
{
  console.log('\n--- Test Suite 2: Legacy 1.12.2 Protocol Multi-Bot Dispatch ---')
  const PORT = 25581
  const VERSION = '1.12.2'

  const server = mc.createServer({
    'online-mode': false,
    host: '127.0.0.1',
    port: PORT,
    version: VERSION
  })

  const serverReceivedPackets = []

  server.on('playerJoin', (client) => {
    client.write('login', {
      entityId: client.id,
      gameMode: 0,
      dimension: 0,
      difficulty: 1,
      maxPlayers: 20,
      levelType: 'default',
      reducedDebugInfo: false
    })
    client.write('update_health', { health: 20, food: 20, foodSaturation: 5 })
    setTimeout(() => {
      client.write('position', { x: 0, y: 64, z: 0, yaw: 0, pitch: 0, flags: 0, teleportId: 1 })
    }, 50)

    client.on('packet', (data, meta) => {
      if (meta.name === 'chat') {
        serverReceivedPackets.push({
          bot: client.username,
          message: data.message
        })
      }
    })
  })

  await new Promise((res) => server.once('listening', res))
  console.log(`✓ 1.12.2 Legacy Mock Server running on 127.0.0.1:${PORT}`)

  const botMap = new Map()
  const botList = []
  for (let i = 1; i <= 3; i++) {
    const uname = `Legacy_${i}`
    const b = mineflayer.createBot({
      host: '127.0.0.1',
      port: PORT,
      username: uname,
      version: VERSION,
      hideErrors: true
    })
    botMap.set(uname, b)
    botList.push(b)
  }

  await Promise.all(botList.map((b) => new Promise((res) => b.once('spawn', res))))
  console.log(`✓ 3 legacy bots connected & spawned on 1.12.2 server`)

  const resolver = createBotResolver(botMap)

  // Test commands and chat on 1.12.2 (must use 'chat' packet, never 'chat_command')
  resolver.setPlayerList(['Legacy_1', 'Legacy_2', 'Legacy_3'])
  const selected = resolver.resolveTargetBots()
  assert.strictEqual(selected.length, 3)

  serverReceivedPackets.length = 0
  await sendBotMessage(selected[0], '/server hub')
  await sendBotMessage(selected[1], '/login legacy123')
  await sendBotMessage(selected[2], 'Legacy Chat Message')

  await delay(500)

  assert.strictEqual(
    serverReceivedPackets.length,
    3,
    `Expected 3 packets, got ${serverReceivedPackets.length}`
  )
  const receivedMessages = serverReceivedPackets.map((p) => p.message).sort()
  const expectedMessages = ['/server hub', '/login legacy123', 'Legacy Chat Message'].sort()
  assert.deepStrictEqual(receivedMessages, expectedMessages)
  console.log('✓ 1.12.2 Legacy command and chat packet dispatch verified:', serverReceivedPackets)

  botList.forEach((b) => b.end())
  server.close()
}

// -------------------------------------------------------------
// TEST SUITE 3: UI Bot Selection Synchronizer Unit Tests
// -------------------------------------------------------------
{
  console.log('\n--- Test Suite 3: Bot Selection & Deselection Mechanics ---')

  const botMap = new Map()
  botMap.set('Alpha', { username: 'Alpha' })
  botMap.set('Beta', { username: 'Beta' })
  botMap.set('Gamma', { username: 'Gamma' })

  const resolver = createBotResolver(botMap)

  // Case 1: Empty playerList falls back to all connected bots
  resolver.setPlayerList([])
  let targets = resolver.resolveTargetBots()
  assert.strictEqual(targets.length, 3, 'Empty playerList falls back to all 3 bots')

  // Case 2: Explicit subset
  resolver.setPlayerList(['Alpha', 'gamma']) // Test case-insensitivity
  targets = resolver.resolveTargetBots()
  assert.strictEqual(targets.length, 2, 'Resolved 2 bots with case-insensitivity')
  assert.strictEqual(targets[0].username, 'Alpha')
  assert.strictEqual(targets[1].username, 'Gamma')

  // Case 3: Stale / invalid bot names in playerList fallback safely
  resolver.setPlayerList(['NonExistentBot1', 'NonExistentBot2'])
  targets = resolver.resolveTargetBots()
  assert.strictEqual(targets.length, 3, 'Stale list safely falls back to all active bots')

  console.log('✓ Bot selection and fallback resolver unit tests passed')
}

console.log('\n===============================================================')
console.log(' ALL BOT SELECTION & MESSAGE DISPATCH TESTS PASSED (100%)')
console.log('===============================================================')
process.exit(0)
