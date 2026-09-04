import assert from 'assert'
import { ConsoleManager } from '../src/main/js/misc/consoleStreamer.js'

console.log('=== Running Synchronized Server Console & Lead Bot Unit Tests ===')

const manager = new ConsoleManager()

// Test 1: Lead Bot Election (First connected bot becomes primary)
{
  manager.reset()
  const r1 = manager.onBotConnected('AlphaBot')
  assert.strictEqual(r1.leadChanged, true, 'First bot must trigger leadChanged')
  assert.strictEqual(r1.primaryBot, 'AlphaBot', 'First bot must become primary')
  assert.strictEqual(manager.isLeadBot('AlphaBot'), true, 'AlphaBot must be lead')
  assert.strictEqual(manager.isLeadBot('alphabot'), true, 'Lead check must be case-insensitive')

  // Second and third bots join
  const r2 = manager.onBotConnected('BetaBot')
  assert.strictEqual(r2.leadChanged, false, 'Second bot joining must not change lead')
  assert.strictEqual(r2.primaryBot, 'AlphaBot')
  assert.strictEqual(manager.isLeadBot('BetaBot'), false)

  const r3 = manager.onBotConnected('GammaBot')
  assert.strictEqual(r3.leadChanged, false)
  assert.strictEqual(manager.getConnectedCount(), 3)
  assert.deepStrictEqual(manager.connectedBotsOrder, ['AlphaBot', 'BetaBot', 'GammaBot'])
  console.log('✓ Lead bot election and connection ordering passed')
}

// Test 2: Public Server Chat Deduplication (Only lead bot streams public messages)
{
  const publicMsg = '[Server] Daily restart scheduled in 15 minutes.'

  // AlphaBot (Lead) receives the broadcast
  const evalAlpha = manager.evaluateMessage(publicMsg, 'AlphaBot')
  assert.strictEqual(evalAlpha.allowed, true, 'Lead bot public message must be allowed')
  assert.strictEqual(evalAlpha.isPrivate, false, 'Public message must not be marked private')
  assert.strictEqual(evalAlpha.isLead, true)

  // BetaBot (Worker) receives the same broadcast
  const evalBeta = manager.evaluateMessage(publicMsg, 'BetaBot')
  assert.strictEqual(evalBeta.allowed, false, 'Worker bot duplicate public message must be dropped')
  assert.strictEqual(evalBeta.isPrivate, false)

  // GammaBot (Worker) receives the same broadcast
  const evalGamma = manager.evaluateMessage(publicMsg, 'GammaBot')
  assert.strictEqual(
    evalGamma.allowed,
    false,
    'Worker bot duplicate public message must be dropped'
  )

  console.log('✓ Public server chat deduplication across worker bots passed')
}

// Test 3: Universal Private Message / Whisper Detection on ANY Bot
{
  // Test whisper sent to worker bot BetaBot
  const whisper1 = 'Player123 whispers to you: Can you help me with this quest?'
  const evalWhisper1 = manager.evaluateMessage(whisper1, 'BetaBot')
  assert.strictEqual(evalWhisper1.allowed, true, 'Whisper to worker bot must be allowed')
  assert.strictEqual(evalWhisper1.isPrivate, true, 'Must be identified as private')

  // Test Turkish whisper format sent to worker bot GammaBot
  const whisper2 = 'Oyuncu sana fısıldıyor: selam kanka'
  const evalWhisper2 = manager.evaluateMessage(whisper2, 'GammaBot')
  assert.strictEqual(evalWhisper2.allowed, true, 'Turkish whisper must be allowed')
  assert.strictEqual(evalWhisper2.isPrivate, true)

  // Test [PM] / [Whisper] tag format
  const whisper3 = '[PM] CoolGuy: Hey GammaBot check this out'
  const evalWhisper3 = manager.evaluateMessage(whisper3, 'GammaBot')
  assert.strictEqual(evalWhisper3.allowed, true)
  assert.strictEqual(evalWhisper3.isPrivate, true)

  // Test Arrow format directed to bot
  const whisper4 = 'Admin -> GammaBot: Please follow server rules'
  const evalWhisper4 = manager.evaluateMessage(whisper4, 'GammaBot')
  assert.strictEqual(evalWhisper4.allowed, true)
  assert.strictEqual(evalWhisper4.isPrivate, true)

  // Test AuthMe / Captcha directive directed to bot
  const authMsg = 'Please use /login <password> to play on the server.'
  const evalAuth = manager.evaluateMessage(authMsg, 'BetaBot')
  assert.strictEqual(evalAuth.allowed, true, 'Auth directive to worker bot must be allowed')
  assert.strictEqual(evalAuth.isPrivate, true)

  const captchaMsg = 'Güvenlik Kodu / Captcha: 4892'
  const evalCaptcha = manager.evaluateMessage(captchaMsg, 'GammaBot')
  assert.strictEqual(evalCaptcha.allowed, true)
  assert.strictEqual(evalCaptcha.isPrivate, true)

  console.log('✓ Universal private message & whisper routing across any bot passed')
}

// Test 4: Dynamic Failover (Lead disconnects -> next bot becomes lead)
{
  // AlphaBot disconnects
  const disconnectAlpha = manager.onBotDisconnected('AlphaBot')
  assert.strictEqual(disconnectAlpha.leadChanged, true, 'Lead disconnect must trigger leadChanged')
  assert.strictEqual(disconnectAlpha.oldLead, 'AlphaBot')
  assert.strictEqual(disconnectAlpha.newLead, 'BetaBot', 'BetaBot must become new lead')
  assert.strictEqual(manager.isLeadBot('BetaBot'), true)
  assert.strictEqual(manager.isLeadBot('AlphaBot'), false)

  // Now public broadcasts flow from BetaBot!
  const publicMsg = '[Server] Event starting in the arena!'
  const evalBeta = manager.evaluateMessage(publicMsg, 'BetaBot')
  assert.strictEqual(evalBeta.allowed, true, 'New lead bot must stream public messages')
  assert.strictEqual(evalBeta.isLead, true)

  // GammaBot is still worker
  const evalGamma = manager.evaluateMessage(publicMsg, 'GammaBot')
  assert.strictEqual(evalGamma.allowed, false, 'GammaBot is worker, public dropped')

  console.log('✓ Dynamic failover on lead disconnect passed')
}

// Test 5: Second Failover & All Disconnected
{
  // BetaBot is kicked
  const disconnectBeta = manager.onBotDisconnected('BetaBot')
  assert.strictEqual(disconnectBeta.leadChanged, true)
  assert.strictEqual(disconnectBeta.newLead, 'GammaBot', 'GammaBot promoted to lead')
  assert.strictEqual(manager.isLeadBot('GammaBot'), true)

  // GammaBot disconnects -> No bots left
  const disconnectGamma = manager.onBotDisconnected('GammaBot')
  assert.strictEqual(disconnectGamma.leadChanged, true)
  assert.strictEqual(
    disconnectGamma.newLead,
    null,
    'newLead must be null when all bots disconnected'
  )
  assert.strictEqual(manager.getLeadBot(), null)
  assert.strictEqual(manager.getConnectedCount(), 0)

  // New bot joins fresh
  const rNew = manager.onBotConnected('DeltaBot')
  assert.strictEqual(rNew.leadChanged, true)
  assert.strictEqual(rNew.primaryBot, 'DeltaBot')
  assert.strictEqual(manager.isLeadBot('DeltaBot'), true)

  console.log('✓ Second failover and full disconnect/reconnect cycle passed')
}

console.log('=== ALL SYNCHRONIZED SERVER CONSOLE UNIT TESTS PASSED! ===')
