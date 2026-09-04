import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import mc from 'minecraft-protocol'
import mineflayer from 'mineflayer'
import minecraftData from 'minecraft-data'
import nbt from 'prismarine-nbt'
import { autoAuth } from '../../../src/main/js/misc/autoAuth.js'
import { sendBotMessage } from '../../../src/main/js/misc/spammerEngine.js'

const VERSION = process.env.TRAFFICER_TEST_VERSION || '1.20.4'
const PROXY_PORT = Number(process.env.TRAFFICER_PROXY_PORT || 25596)
const AUTH_PORT = Number(process.env.TRAFFICER_AUTH_BACKEND_PORT || 25598)
const LOBBY_PORT = Number(process.env.TRAFFICER_LOBBY_BACKEND_PORT || 25599)
const RUNTIME_DIR = path.resolve(
  process.env.TRAFFICER_VELOCITY_DIR || 'test/runtime/proxy-velocity'
)
const VELOCITY_JAR = path.resolve(
  process.env.TRAFFICER_VELOCITY_JAR || path.join(RUNTIME_DIR, 'velocity.jar')
)
const JAVA = process.env.TRAFFICER_TEST_JAVA || 'F:\\vds\\Java\\jdk-25.0.2+10\\bin\\java.exe'
const PASSWORD = 'velocity-local-test'
const data = minecraftData(VERSION)

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function waitFor(emitter, event, timeoutMs, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      emitter.off(event, listener)
      reject(new Error(`Timed out waiting for ${event}`))
    }, timeoutMs)
    const listener = (...args) => {
      if (!predicate(...args)) return
      clearTimeout(timer)
      emitter.off(event, listener)
      resolve(args)
    }
    emitter.on(event, listener)
  })
}

function createBackend(port, worldName, prompt, teleportId) {
  const packets = []
  const server = mc.createServer({
    'online-mode': false,
    host: '127.0.0.1',
    port,
    version: VERSION
  })

  server.on('playerJoin', (client) => {
    client.on('packet', (packet, meta) => packets.push({ name: meta.name, packet }))
    client.write('login', {
      ...data.loginPacket,
      entityId: client.id || teleportId,
      worldName
    })
    client.write('update_health', { health: 20, food: 20, foodSaturation: 5 })
    setTimeout(() => {
      client.write('position', {
        x: teleportId,
        y: 72,
        z: teleportId,
        yaw: 0,
        pitch: 0,
        flags: 0,
        teleportId
      })
      client.write('system_chat', {
        content: nbt.comp({ text: nbt.string(prompt) }),
        isActionBar: false
      })
    }, 100)
  })

  return { server, packets }
}

async function listen(server) {
  if (server.socketServer?.listening) return
  await waitFor(server, 'listening', 10000)
}

if (!fs.existsSync(VELOCITY_JAR)) {
  throw new Error(
    `Velocity fixture missing: ${VELOCITY_JAR}. Download an official Velocity jar as documented in test/networks/proxy/README.md.`
  )
}
if (!fs.existsSync(JAVA)) throw new Error(`Java executable missing: ${JAVA}`)

fs.mkdirSync(RUNTIME_DIR, { recursive: true })
fs.writeFileSync(
  path.join(RUNTIME_DIR, 'velocity.toml'),
  `config-version = "2.8"
bind = "127.0.0.1:${PROXY_PORT}"
motd = "<green>TrafficerMC isolated Velocity test"
show-max-players = 5
online-mode = false
force-key-authentication = false
prevent-client-proxy-connections = false
player-info-forwarding-mode = "NONE"
forwarding-secret-file = "forwarding.secret"
announce-forge = false
kick-existing-players = false
sample-players-in-ping = false
enable-player-address-logging = false
ping-passthrough = "DISABLED"

[packet-limiter]
interval = 7
packets-per-second = -1
bytes-per-second = -1
decompressed-bytes-per-second = 5242880

[servers]
auth = "127.0.0.1:${AUTH_PORT}"
lobby = "127.0.0.1:${LOBBY_PORT}"
try = ["auth"]

[forced-hosts]

[advanced]
compression-threshold = 256
compression-level = -1
login-ratelimit = 0
connection-timeout = 5000
read-timeout = 30000
haproxy-protocol = false
tcp-fast-open = false
bungee-plugin-message-channel = true
show-ping-requests = false
failover-on-unexpected-server-disconnect = true
announce-proxy-commands = true
log-command-executions = true
log-player-connections = true
accepts-transfers = false
enable-reuse-port = false
command-rate-limit = 50
forward-commands-if-rate-limited = true
kick-after-rate-limited-commands = 0
tab-complete-rate-limit = 10
kick-after-rate-limited-tab-completes = 0

[query]
enabled = false
port = ${PROXY_PORT}
map = "Velocity"
show-plugins = false
`,
  'utf8'
)

const auth = createBackend(
  AUTH_PORT,
  'minecraft:auth',
  'Please register using /register <password> <password>',
  401
)
const lobby = createBackend(
  LOBBY_PORT,
  'minecraft:lobby',
  'Please login using /login <password>',
  402
)
let velocity
let bot
let expectedEnd = false
let unexpectedEnd = null

try {
  await Promise.all([listen(auth.server), listen(lobby.server)])
  velocity = spawn(JAVA, ['-Xms256M', '-Xmx512M', '-jar', VELOCITY_JAR], {
    cwd: RUNTIME_DIR,
    stdio: ['pipe', 'pipe', 'pipe']
  })
  let velocityOutput = ''
  velocity.stdout.on('data', (chunk) => {
    velocityOutput += chunk.toString()
  })
  velocity.stderr.on('data', (chunk) => {
    velocityOutput += chunk.toString()
  })
  await waitFor(velocity.stdout, 'data', 30000, () =>
    /Done \(|Listening on|bind completed/i.test(velocityOutput)
  )

  bot = mineflayer.createBot({
    host: '127.0.0.1',
    port: PROXY_PORT,
    version: VERSION,
    username: `Velocity_${Date.now().toString(36)}`.slice(0, 16),
    auth: 'offline',
    physicsEnabled: false,
    hideErrors: false
  })
  bot.on('end', (reason) => {
    if (!expectedEnd) unexpectedEnd = reason || 'connection ended'
  })
  bot.loadPlugin((instance) => autoAuth(instance, { enabled: true, password: PASSWORD, delay: 50 }))

  await waitFor(bot, 'spawn', 30000)
  await delay(600)
  assert.ok(
    auth.packets.some(
      ({ name, packet }) =>
        (name === 'chat_command' && packet.command === `register ${PASSWORD} ${PASSWORD}`) ||
        (name === 'chat_message' && packet.message === `/register ${PASSWORD} ${PASSWORD}`)
    ),
    'Auth backend did not receive the registration command'
  )

  const lobbyJoin = waitFor(lobby.server, 'playerJoin', 15000)
  assert.equal(await sendBotMessage(bot, '/server lobby'), true)
  await lobbyJoin
  await delay(1000)

  assert.ok(
    lobby.packets.some(
      ({ name, packet }) =>
        (name === 'chat_command' && packet.command === `login ${PASSWORD}`) ||
        (name === 'chat_message' && packet.message === `/login ${PASSWORD}`)
    ),
    'Lobby backend did not receive the login command after Velocity transfer'
  )
  assert.equal(unexpectedEnd, null, 'Client disconnected during the real Velocity transfer')
  assert.equal(bot._client.state, 'play')
  console.log('PASS Velocity live: auth backend -> /server lobby -> re-auth, connection retained')
} finally {
  expectedEnd = true
  bot?.end('Velocity live test complete')
  if (velocity && velocity.exitCode === null) {
    const velocityExit = waitFor(velocity, 'exit', 10000).catch(() => undefined)
    velocity.stdin.write('shutdown\n')
    await velocityExit
  }
  if (velocity && velocity.exitCode === null) velocity.kill()
  auth.server.close()
  lobby.server.close()
}
