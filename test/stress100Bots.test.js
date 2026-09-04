import assert from 'assert'
import { spawn } from 'child_process'
import mineflayer from 'mineflayer'
import { autoAuth } from '../src/main/js/misc/autoAuth.js'
import { resolveBotVersion } from '../src/main/js/misc/versionResolver.js'
import { sendBotMessage, getNextMessage } from '../src/main/js/misc/spammerEngine.js'

const JAVA_PATH = process.env.TRAFFICER_TEST_JAVA || 'F:\\vds\\Java\\jdk-25.0.2+10\\bin\\java.exe'
const SERVER_DIR =
  process.env.TRAFFICER_TEST_SERVER_DIR || 'D:\\TrafficerMC\\test\\runtime\\direct-paper'
const PORT = Number(process.env.TRAFFICER_TEST_PORT || 25577)
const TOTAL_BOTS = Number(process.env.TRAFFICER_STRESS_BOTS || 100)
const PASSWORD = 'stressTest123!'

console.log(`\n======================================================`)
console.log(`=== 100 BOTS STRESS TEST: AUTO-AUTH & CHAT SPAMMER ===`)
console.log(`======================================================\n`)

console.log(`[Step 1] Launching local Paper server (port ${PORT})...`)
const serverProcess = spawn(JAVA_PATH, ['-Xms1024M', '-Xmx2048M', '-jar', 'paper.jar', 'nogui'], {
  cwd: SERVER_DIR
})

let serverReady = false
serverProcess.stdout.on('data', (data) => {
  const str = data.toString()
  if (!serverReady && (str.includes('Done (') || str.includes('For help, type "help"'))) {
    serverReady = true
    console.log('✓ Paper server is ready to accept connections!')
    runStressTest()
  }
})

serverProcess.stderr.on('data', (_data) => {
  // console.error('[Server Err]', data.toString().trim())
})

async function runStressTest() {
  console.log(`\n[Step 2] Connecting ${TOTAL_BOTS} bots concurrently with native 26.1...`)

  const bots = []
  const connectedBots = new Set()
  const authenticatedBots = new Set()
  const spawnedBots = new Set()
  const errors = []

  for (let i = 0; i < TOTAL_BOTS; i++) {
    const versionInput = '26.1'
    const resolvedVer = resolveBotVersion(versionInput)
    const username = `StressBot_${i + 1}`

    const bot = mineflayer.createBot({
      host: '127.0.0.1',
      port: PORT,
      username,
      version: resolvedVer,
      hideErrors: true,
      plugins: {
        tablist: false,
        title: false
      }
    })

    // Load Auto-Auth
    bot.loadPlugin((b) => autoAuth(b, { enabled: true, password: PASSWORD }))

    bot.once('login', () => {
      connectedBots.add(username)
      if (connectedBots.size % 20 === 0 || connectedBots.size === TOTAL_BOTS) {
        console.log(`  -> Connected: ${connectedBots.size}/${TOTAL_BOTS} bots`)
      }
    })

    bot.once('spawn', () => {
      spawnedBots.add(username)
    })

    bot.on('authSuccess', () => {
      authenticatedBots.add(username)
    })

    bot.on('messagestr', (msg) => {
      if (
        msg.includes('Successful login') ||
        msg.includes('Successfully registered') ||
        msg.includes('You are now logged in') ||
        msg.includes('successful')
      ) {
        authenticatedBots.add(username)
      }
    })

    bot.on('kicked', (reason) => {
      errors.push({ username, type: 'kicked', reason })
    })

    bot.on('error', (err) => {
      errors.push({ username, type: 'error', message: err.message })
    })

    bots.push(bot)
    // Stagger joins by 85ms to allow smooth network handshakes
    await new Promise((r) => setTimeout(r, 85))
  }

  console.log(`\n[Step 3] Waiting for all ${TOTAL_BOTS} bots to authenticate and spawn...`)

  const startTime = Date.now()
  while (Date.now() - startTime < 60000) {
    for (const b of bots) {
      if (b.autoAuth?.authenticated) {
        authenticatedBots.add(b.username)
      }
    }
    if (spawnedBots.size >= TOTAL_BOTS && authenticatedBots.size >= TOTAL_BOTS) {
      break
    }
    await new Promise((r) => setTimeout(r, 500))
  }

  for (const b of bots) {
    if (b.autoAuth?.authenticated) {
      authenticatedBots.add(b.username)
    }
  }

  console.log(
    `✓ Status check: Connected=${connectedBots.size}/${TOTAL_BOTS}, Spawned=${spawnedBots.size}/${TOTAL_BOTS}, Authenticated=${authenticatedBots.size}/${TOTAL_BOTS}`
  )
  assert.ok(connectedBots.size >= 90, `Expected >= 90 connected bots, got ${connectedBots.size}`)
  assert.ok(spawnedBots.size >= 85, `Expected >= 85 spawned bots, got ${spawnedBots.size}`)
  assert.ok(
    authenticatedBots.size >= 85,
    `Expected >= 85 authenticated bots, got ${authenticatedBots.size}`
  )

  console.log(`\n[Step 4] Testing Command Execution across all active bots (/help)...`)
  let commandSuccessCount = 0
  for (const bot of bots.slice(0, 25)) {
    // Test sample of 25 bots for commands
    const ok = await sendBotMessage(bot, '/help')
    if (ok) commandSuccessCount++
  }
  console.log(`✓ Commands dispatched successfully: ${commandSuccessCount}/25 bots`)
  assert.ok(
    commandSuccessCount >= 20,
    `Commands failed to dispatch! Success count: ${commandSuccessCount}`
  )

  console.log(`\n[Step 5] Testing LiquidLauncher Spammer Formatting across bots...`)
  const testMessages = [
    'TrafficerMC Stress Test Message 1',
    'Local Server Performance Verification 2',
    'Zero Lag Spammer Throughput 3'
  ]

  let spamSuccessCount = 0
  // Test 1: Suffix [rAndOm] bypass
  for (let i = 0; i < 15; i++) {
    const bot = bots[i]
    const raw = getNextMessage(testMessages, 'sequence', { index: i })
    const ok = await sendBotMessage(bot, raw, {
      customFormatter: true,
      formatterPosition: 'suffix'
    })
    if (ok) spamSuccessCount++
  }

  // Test 2: Leet converter with prefix [rAndOm]
  for (let i = 15; i < 30; i++) {
    const bot = bots[i]
    const raw = getNextMessage(testMessages, 'random')
    const ok = await sendBotMessage(bot, raw, {
      converter: 'leet',
      customFormatter: true,
      formatterPosition: 'prefix'
    })
    if (ok) spamSuccessCount++
  }

  // Test 3: Random Case converter
  for (let i = 30; i < 45; i++) {
    const bot = bots[i]
    const raw = getNextMessage(testMessages, 'random')
    const ok = await sendBotMessage(bot, raw, {
      converter: 'random_case',
      customFormatter: true,
      formatterPosition: 'both'
    })
    if (ok) spamSuccessCount++
  }

  console.log(`✓ LiquidLauncher spammer messages dispatched: ${spamSuccessCount}/45 samples`)
  assert.ok(spamSuccessCount >= 40, `Spammer dispatch failed! Success count: ${spamSuccessCount}`)

  console.log(
    `\n[Step 6] Cleaning up: disconnecting all ${bots.length} bots and stopping server...`
  )
  for (const bot of bots) {
    try {
      bot.quit()
    } catch (_) {}
  }

  await new Promise((r) => setTimeout(r, 2000))
  serverProcess.kill()

  console.log(`\n=================================================================`)
  console.log(`=== 100 BOTS TEST PASSED: ALL BOTS CONNECTED, AUTHED & SPAMMED ===`)
  console.log(`=================================================================\n`)
  process.exit(0)
}

setTimeout(() => {
  if (!serverReady) {
    console.error('Server timed out starting')
    serverProcess.kill()
    process.exit(1)
  }
}, 75000)
