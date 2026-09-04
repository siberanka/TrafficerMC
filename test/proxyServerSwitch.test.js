import assert from 'assert'
import mc from 'minecraft-protocol'
import mineflayer from 'mineflayer'
import minecraftData from 'minecraft-data'
import nbt from 'prismarine-nbt'
import { autoAuth } from '../src/main/js/misc/autoAuth.js'
import { botMode } from '../src/main/js/misc/utils.js'
import { sendBotMessage } from '../src/main/js/misc/spammerEngine.js'

console.log('--- Testing Minecraft Proxy /server Switch and AutoAuth Sub-Server Transfer ---')

const PORT = 25597
const VERSION = '1.20.4'
const mcData = minecraftData(VERSION)

// 1. Start mock BungeeCord Proxy
const server = mc.createServer({
  'online-mode': false,
  host: '127.0.0.1',
  port: PORT,
  version: VERSION
})

let proxyClient = null
const receivedPackets = []

server.on('playerJoin', (client) => {
  proxyClient = client

  client.on('packet', (data, meta) => {
    receivedPackets.push({ name: meta.name, data })
  })

  // Send initial login packet (Lobby)
  const loginData = {
    ...mcData.loginPacket,
    entityId: client.id || 100
  }
  client.write('login', loginData)

  // Send initial health update
  client.write('update_health', {
    health: 20,
    food: 20,
    foodSaturation: 5
  })

  // Send initial position
  setTimeout(() => {
    client.write('position', {
      x: 0,
      y: 64,
      z: 0,
      yaw: 0,
      pitch: 0,
      flags: 0,
      teleportId: 101
    })
  }, 50)
})

await new Promise((resolve) => {
  if (server.socketServer?.listening) resolve()
  else server.once('listening', resolve)
})
console.log(`✓ Mock Proxy server listening on 127.0.0.1:${PORT}`)

// 2. Spawn bot with minimal mode to verify protocol stability
const bot = mineflayer.createBot({
  host: '127.0.0.1',
  port: PORT,
  username: 'ProxyBot',
  version: VERSION,
  hideErrors: true,
  ...botMode('minimal')
})

bot.loadPlugin((b) => autoAuth(b, { enabled: true, password: 'testSubServerPass' }))
let expectedShutdown = false
let unexpectedDisconnect = null
bot.on('end', (reason) => {
  if (!expectedShutdown) unexpectedDisconnect = reason || 'connection ended'
})

await new Promise((resolve) => bot.once('spawn', resolve))
console.log('✓ Bot connected and spawned in Lobby')

// Step A: Lobby Authentication
console.log('Testing Lobby Authentication...')
proxyClient.write('system_chat', {
  content: nbt.comp({ text: nbt.string('Please register with /register <password> <password>') }),
  isActionBar: false
})

await new Promise((res) => setTimeout(res, 800))
// Lobby confirms registration
proxyClient.write('system_chat', {
  content: nbt.comp({
    text: nbt.string('Registration completed successfully! Welcome to the server.')
  }),
  isActionBar: false
})
await new Promise((res) => setTimeout(res, 200))

assert.strictEqual(bot.autoAuth?.authenticated, true, 'Bot should be marked authenticated in Lobby')
console.log('✓ Lobby authentication successful and authenticated = true')

// Step B: Send /server survival command
console.log('Executing /server survival command...')
assert.strictEqual(await sendBotMessage(bot, '/server survival'), true)
await new Promise((res) => setTimeout(res, 400))

const serverCmd = receivedPackets.find(
  (p) =>
    (p.name === 'chat_command' && p.data?.command?.includes('server survival')) ||
    (p.name === 'chat_message' && p.data?.message?.includes('/server survival'))
)
assert.ok(serverCmd, 'Proxy should receive /server survival command from bot')
console.log('✓ /server survival command successfully delivered to proxy')

// Step C: Proxy initiates server switch sequence to "survival"
console.log('Simulating Proxy server transfer (Respawn + Position)...')
proxyClient.write('respawn', {
  dimension: 'minecraft:overworld',
  worldName: 'minecraft:survival',
  hashedSeed: [0, 0],
  gamemode: 0,
  previousGamemode: 255,
  isDebug: false,
  isFlat: false,
  copyMetadata: false,
  death: undefined,
  portalCooldown: 0
})

// Immediately follow with sub-server spawn position and teleportId
setTimeout(() => {
  proxyClient.write('position', {
    x: 250,
    y: 72,
    z: 250,
    yaw: 180,
    pitch: 0,
    flags: 0,
    teleportId: 303
  })
}, 100)

// Sub-server prompts for authentication
setTimeout(() => {
  proxyClient.write('system_chat', {
    content: nbt.comp({
      text: nbt.string('Welcome to Survival! Lutfen giris yapin: /login <sifre>')
    }),
    isActionBar: false
  })
}, 300)

await new Promise((res) => setTimeout(res, 1500))

// Step D: Verify Teleport Confirmation & Sub-server Auto-Login
const teleport303 = receivedPackets.filter(
  (p) => p.name === 'teleport_confirm' && p.data?.teleportId === 303
)
assert.strictEqual(
  teleport303.length,
  1,
  'Mineflayer must confirm the sub-server teleport exactly once (no duplicate raw handler)'
)
console.log('✓ Sub-server teleport_confirm (303) received exactly once')

const subServerLogin = receivedPackets.find(
  (p) =>
    (p.name === 'chat_command' && p.data?.command?.includes('login testSubServerPass')) ||
    (p.name === 'chat_message' && p.data?.message?.includes('login testSubServerPass'))
)
assert.ok(subServerLogin, 'Bot should send /login command on sub-server')
console.log('✓ Bot successfully dispatched /login on sub-server after transfer')

assert.strictEqual(unexpectedDisconnect, null, 'Bot disconnected during the proxy transfer')
assert.strictEqual(bot._client.state, 'play', 'Bot must remain in play state after proxy transfer')
console.log('✓ connection remains in play state after proxy transfer')

// Cleanup
expectedShutdown = true
bot.end()
server.close()
console.log('✓ All Proxy /server transfer and sub-server authentication tests passed successfully!')
process.exit(0)
