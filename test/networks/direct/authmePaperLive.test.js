import assert from 'node:assert/strict'
import mineflayer from 'mineflayer'
import { autoAuth } from '../../../src/main/js/misc/autoAuth.js'
import { sendBotMessage } from '../../../src/main/js/misc/spammerEngine.js'

const host = process.env.TRAFFICER_TEST_HOST || '127.0.0.1'
const port = Number(process.env.TRAFFICER_TEST_PORT || 25577)
const version = process.env.TRAFFICER_TEST_VERSION || '26.1'
const password = process.env.TRAFFICER_TEST_PASSWORD || 'trafficermc-live-test'
const username = `Direct_${Date.now().toString(36)}`.slice(0, 16)

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

console.log(`Direct Paper/AuthMe live test: ${host}:${port}, protocol ${version}, user ${username}`)

const bot = mineflayer.createBot({
  host,
  port,
  version,
  username,
  auth: 'offline',
  hideErrors: false,
  physicsEnabled: false,
  viewDistance: 'tiny'
})

const outgoing = []
const originalWrite = bot._client.write.bind(bot._client)
const originalWriteRaw = bot._client.writeRaw.bind(bot._client)
bot._client.write = (name, data) => {
  if (name === 'custom_click_action' || name.startsWith('chat')) outgoing.push({ name, data })
  return originalWrite(name, data)
}
bot._client.writeRaw = (buffer) => {
  if (buffer.includes(Buffer.from('authme:prejoin-'))) {
    outgoing.push({ name: 'custom_click_action_raw', data: buffer })
  }
  return originalWriteRaw(buffer)
}

bot.loadPlugin((instance) => autoAuth(instance, { enabled: true, password, delay: 100 }))

try {
  const authPromise = waitFor(bot, 'authSuccess', 45000)
  await waitFor(bot, 'spawn', 45000)
  await authPromise

  assert.equal(bot.autoAuth.authenticated, true)
  assert.ok(
    outgoing.some(
      (packet) =>
        packet.name === 'custom_click_action_raw' ||
        (packet.name === 'custom_click_action' &&
          packet.data.id === 'authme:prejoin-register/submit')
    ),
    'AuthMe pre-join register dialog was not submitted in configuration state'
  )

  // Paper/AuthMe still finalizes the configuration-to-play transition just after
  // its success message. Avoid classifying that transition window as chat spam.
  await new Promise((resolve) => setTimeout(resolve, 1200))

  const marker = `direct-chat-${Date.now().toString(36)}`
  const chatSeen = waitFor(bot, 'messagestr', 10000, (message) => String(message).includes(marker))
  assert.equal(await sendBotMessage(bot, marker), true)
  await chatSeen
  await new Promise((resolve) => setTimeout(resolve, 1200))

  const commandSeen = waitFor(bot, 'messagestr', 10000, (message) =>
    /unknown or incomplete command/i.test(String(message))
  )
  assert.equal(await sendBotMessage(bot, '/trafficermc_delivery_probe'), true)
  await commandSeen

  console.log('PASS direct: pre-join registration, chat and command delivery')
} finally {
  bot.end('direct live test complete')
}
