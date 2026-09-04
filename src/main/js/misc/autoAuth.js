import prismarineNbt from 'prismarine-nbt'

const { comp, string: nbtString, simplify: simplifyNbt } = prismarineNbt

const PRE_JOIN_ACTION = Object.freeze({
  login: 'authme:prejoin-login/submit',
  register: 'authme:prejoin-register/submit'
})

function logEvent(username, event, message) {
  try {
    // eslint-disable-next-line no-undef
    const { BrowserWindow } = require('electron')
    const win = BrowserWindow?.getAllWindows?.()[0]
    win?.webContents.send('botEvent', { id: username, event, message })
  } catch {
    // Electron is intentionally unavailable in unit and live-network tests.
  }
}

/** Recursively extracts string values and meaningful field names from chat/dialog/NBT payloads. */
export function extractAllStrings(data, bucket = [], seen = new Set()) {
  if (data === null || data === undefined || seen.has(data)) return bucket
  if (typeof data === 'string') {
    bucket.push(data)
    try {
      const parsed = JSON.parse(data)
      if (parsed && typeof parsed === 'object') extractAllStrings(parsed, bucket, seen)
    } catch {
      // Plain text.
    }
    return bucket
  }
  if (typeof data !== 'object') return bucket
  seen.add(data)
  if (Array.isArray(data)) {
    for (const item of data) extractAllStrings(item, bucket, seen)
    return bucket
  }
  for (const [key, value] of Object.entries(data)) {
    if (/^(?:id|key|name|action|command|template|input|field)/i.test(key)) bucket.push(key)
    extractAllStrings(value, bucket, seen)
  }
  return bucket
}

/** Handles JSON components, registry holders and both raw and simplified prismarine-NBT. */
export function extractText(data) {
  if (data === null || data === undefined) return ''
  if (typeof data === 'string') {
    try {
      return extractText(JSON.parse(data))
    } catch {
      return data
    }
  }
  if (typeof data === 'object' && data.type && data.value !== undefined) {
    try {
      return extractText(simplifyNbt(data))
    } catch {
      // Some registry-holder payloads look like NBT but are already decoded.
    }
  }
  return extractAllStrings(data).join(' ').replace(/\s+/g, ' ').trim()
}

function normalizeText(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ç/g, 'c')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .toLowerCase()
}

export function isRegisterPrompt(text) {
  const value = normalizeText(text)
  return [
    /\/(?:register|reg)\b/,
    /\b(?:register|registration|registrieren|registrarse)\b/,
    /\b(?:kayit|kaydol)\b/,
    /\b(?:create|set|choose) (?:an account|a password)\b/,
    /\b(?:confirm_password|confirmpassword|repeat password)\b/,
    /authme:prejoin-register\/submit/
  ].some((pattern) => pattern.test(value))
}

export function isLoginPrompt(text) {
  const value = normalizeText(text)
  return [
    /\/(?:login|log|l)\b/,
    /\b(?:login|log in|anmelden)\b/,
    /\b(?:giris|oturum ac)\b/,
    /\benter (?:your )?(?:password|pin)\b/,
    /authme:prejoin-login\/submit/
  ].some((pattern) => pattern.test(value))
}

export function isAuthSuccess(text) {
  const value = normalizeText(text)
  return [
    /successful(?:ly)? (?:log(?:ged)? in|register(?:ed)?)/,
    /(?:login|log in|registration) (?:was )?(?:successful|completed)/,
    /(?:giris|kayit) basarili/,
    /basariyla .*?(?:giris|kayit)/,
    /(?:logged-in|authenticated) due to session/,
    /you are (?:now )?(?:logged in|authenticated)/,
    /already logged in/,
    /\bwelcome back\b/,
    /\bhos ?geldiniz\b/
  ].some((pattern) => pattern.test(value))
}

export function classifyAuthPrompt(dataOrText, isNewUser = true) {
  const text = typeof dataOrText === 'string' ? dataOrText : extractText(dataOrText)
  const value = normalizeText(text)
  if (!value) return isNewUser ? 'register' : 'login'
  if (isAuthSuccess(value)) return 'success'

  if (/authme:prejoin-register\/submit/.test(value)) return 'register'
  if (/authme:prejoin-login\/submit/.test(value)) return 'login'
  if (/\b(?:is not|isn't|not) registered\b|\bunregistered\b|kayitli degil/.test(value)) {
    return 'register'
  }
  if (/already (?:have )?registered|already registered|zaten kayit|name_taken/.test(value)) {
    return 'login'
  }

  const hasRegister = isRegisterPrompt(value)
  const hasLogin = isLoginPrompt(value)
  if (hasRegister !== hasLogin) return hasRegister ? 'register' : 'login'
  if (/\bconfirm\b|\brepeat\b/.test(value)) return 'register'
  return isNewUser ? 'register' : 'login'
}

function findPreJoinAction(dialogData, classification) {
  const values = extractAllStrings(dialogData)
  const exact = values.find((value) => {
    const action = String(value)
    return (
      /^authme:prejoin-(?:login|register)\/submit$/i.test(action) ||
      /^nlogin:(?:login|register)\/(?:yes|submit)$/i.test(action)
    )
  })
  if (exact) return String(exact).toLowerCase()
  const legacy = values.some((value) =>
    new RegExp(`authme:pre[_-]?join[_-]?${classification}[_/-]?submit`, 'i').test(String(value))
  )
  return legacy ? PRE_JOIN_ACTION[classification] : null
}

function hasDialogInput(dialogData, inputName) {
  const expected = normalizeText(inputName)
  return extractAllStrings(dialogData).some((value) => normalizeText(value) === expected)
}

function findDialogInput(dialogData, candidates) {
  const expected = new Set(candidates.map(normalizeText))
  return extractAllStrings(dialogData).find((value) => expected.has(normalizeText(value))) || null
}

/** Creates the response payload consumed by Paper's DialogResponseView. */
export function createDialogResponse(dialogData, classification, password, email = '') {
  const fields = createDialogFields(dialogData, classification, password, email)
  return comp(
    Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, nbtString(value)]))
  )
}

function createDialogFields(dialogData, classification, password, email = '') {
  const fields = {}
  if (classification === 'login') {
    fields.password = password
  } else if (classification === 'register') {
    if (hasDialogInput(dialogData, 'email') && !hasDialogInput(dialogData, 'password')) {
      fields.email = email || password
    } else {
      fields.password = password
    }
    const confirmationField = findDialogInput(dialogData, [
      'confirm',
      'confirmation',
      'confirm_password',
      'password_confirm',
      'password_confirmation'
    ])
    if (confirmationField) {
      fields[confirmationField] = fields.email || password
    }
    if (hasDialogInput(dialogData, 'email') && fields.password) {
      fields.email = email
    }
  }
  return fields
}

function encodeVarInt(value) {
  const bytes = []
  let remaining = value >>> 0
  do {
    let byte = remaining & 0x7f
    remaining >>>= 7
    if (remaining !== 0) byte |= 0x80
    bytes.push(byte)
  } while (remaining !== 0)
  return Buffer.from(bytes)
}

function encodeProtocolString(value) {
  const bytes = Buffer.from(String(value), 'utf8')
  return Buffer.concat([encodeVarInt(bytes.length), bytes])
}

/**
 * Encodes the length-prefixed anonymous NBT used by custom_click_action.
 * minecraft-protocol <=1.68 encodes this field as a Boolean option, although
 * the wire format introduced in 1.21.6 is a VarInt byte length. Keep this
 * narrow workaround here until the upstream serializer is corrected.
 */
export function createCustomClickActionPacket(actionId, fields, packetId = 0x08) {
  const tags = []
  for (const [key, value] of Object.entries(fields)) {
    const keyBytes = Buffer.from(key, 'utf8')
    const valueBytes = Buffer.from(String(value), 'utf8')
    if (keyBytes.length > 0xffff || valueBytes.length > 0xffff) {
      throw new RangeError('Dialog field exceeds the Minecraft NBT string limit')
    }
    const tag = Buffer.allocUnsafe(1 + 2 + keyBytes.length + 2 + valueBytes.length)
    let offset = 0
    tag.writeUInt8(0x08, offset++)
    tag.writeUInt16BE(keyBytes.length, offset)
    offset += 2
    keyBytes.copy(tag, offset)
    offset += keyBytes.length
    tag.writeUInt16BE(valueBytes.length, offset)
    offset += 2
    valueBytes.copy(tag, offset)
    tags.push(tag)
  }
  const nbt = Buffer.concat([Buffer.from([0x0a]), ...tags, Buffer.from([0x00])])
  if (nbt.length > 0x8000) throw new RangeError('Dialog response exceeds the 32 KiB limit')
  return Buffer.concat([
    encodeVarInt(packetId),
    encodeProtocolString(actionId),
    encodeVarInt(nbt.length),
    nbt
  ])
}

function getRegisterCommand(text, password, email = '') {
  const value = String(text || '')
  const commandMatch = value.match(/\/(register|reg)\b/i)
  const command = commandMatch ? `/${commandMatch[1].toLowerCase()}` : '/register'
  const normalized = normalizeText(value)
  const argumentPlaceholders = (normalized.match(/<[^>]+>/g) || []).filter(
    (placeholder) => !/email|mail/.test(placeholder)
  ).length
  const passwordPlaceholders = (
    normalized.match(
      /<[^>]*(?:password|pass|sifre|parola|senha|contrasena|passwort|heslo|haslo)[^>]*>/g
    ) || []
  ).length
  const needsConfirmation =
    passwordPlaceholders > 1 || /\bconfirm\b|\brepeat\b|tekrar/.test(normalized)
  const needsEmail = /<[^>]*email[^>]*>/.test(normalized)
  if (needsEmail && email) return `${command} ${password} ${email}`
  const hasExplicitSyntax = !!commandMatch || passwordPlaceholders > 0
  const useConfirmation = needsConfirmation || !hasExplicitSyntax || argumentPlaceholders > 1
  return useConfirmation ? `${command} ${password} ${password}` : `${command} ${password}`
}

function getLoginCommand(text, password) {
  const commandMatch = String(text || '').match(/\/(login|log|l)\b/i)
  return `/${commandMatch ? commandMatch[1].toLowerCase() : 'login'} ${password}`
}

/**
 * Universal offline-server authentication automation.
 * AuthMe 6 pre-join forms are submitted in CONFIGURATION with custom_click_action;
 * ordinary AuthMe, nLogin, OpeNLogin, LoginSecurity and LimboAuth prompts are sent in PLAY.
 */
export function autoAuth(bot, options = {}) {
  const enabled = options.enabled ?? false
  const password = options.password || 'trafficermc123a'
  const email = options.email || ''
  const actionDelay = Math.max(0, Number(options.delay ?? 600))
  const maxAttempts = Math.max(1, Number(options.maxAttempts ?? 5))
  const username = bot._client?.username || bot.username || 'Bot'
  const timers = new Set()

  bot.autoAuth = {
    enabled,
    password,
    authenticated: false,
    hasRegistered: false,
    lastAction: null,
    lastActionTime: 0,
    registerCount: 0,
    loginCount: 0,
    maxAttempts,
    phase: 'idle'
  }
  if (!enabled) return

  const client = bot._client

  const schedule = (fn, delayMs) => {
    const timer = setTimeout(() => {
      timers.delete(timer)
      fn()
    }, delayMs)
    timers.add(timer)
  }

  const sendWhenPlay = (command) => {
    const send = () => {
      const isPlayReady = client?.state === 'play' || (!client?.state && !!bot.entity)
      if (!isPlayReady || client?.ended) return false
      try {
        if (typeof bot.chat === 'function') bot.chat(command)
        else if (typeof client.chat === 'function') client.chat(command)
        else if (typeof client._signedChat === 'function') client._signedChat(command)
        else return false
        return true
      } catch (error) {
        logEvent(username, 'chat', `[Auto-Auth] Command could not be sent: ${error.message}`)
        return false
      }
    }

    schedule(() => {
      if (send()) return
      const onState = (state) => {
        if (state === 'play') {
          client.off?.('state', onState)
          schedule(send, 50)
        }
      }
      client?.on?.('state', onState)
      schedule(() => client?.off?.('state', onState), 10000)
    }, actionDelay)
  }

  const execute = (classification, rawText, force = false) => {
    const state = bot.autoAuth
    const countKey = classification === 'register' ? 'registerCount' : 'loginCount'
    if (state[countKey] >= state.maxAttempts) return
    const now = Date.now()
    if (!force && state.lastAction === classification && now - state.lastActionTime < 1500) return

    state.authenticated = false
    state.lastAction = classification
    state.lastActionTime = now
    state[countKey]++
    state.phase = 'command-pending'
    const command =
      classification === 'register'
        ? getRegisterCommand(rawText, state.password, email)
        : getLoginCommand(rawText, state.password)
    sendWhenPlay(command)
    logEvent(
      username,
      'chat',
      `[Auto-Auth] ${classification === 'register' ? 'Registration' : 'Login'} submitted.`
    )
  }

  const markSuccess = () => {
    const state = bot.autoAuth
    if (state.authenticated) return
    if (state.lastAction === 'register') state.hasRegistered = true
    state.authenticated = true
    state.phase = 'authenticated'
    bot.emit('authSuccess')
    logEvent(username, 'chat', '[Auto-Auth] Authentication successful.')
  }

  const handleIncomingText = (rawText) => {
    if (!rawText) return
    const text = extractText(rawText)
    if (!text) return
    const classification = classifyAuthPrompt(rawText, !bot.autoAuth.hasRegistered)
    if (classification === 'success') return markSuccess()
    if (bot.autoAuth.authenticated) return
    if (
      !isRegisterPrompt(text) &&
      !isLoginPrompt(text) &&
      !/(?:is not|isn't|not) registered|unregistered|already (?:have )?registered/i.test(text)
    ) {
      return
    }
    execute(classification, text, bot.autoAuth.lastAction !== classification)
  }

  const handleDialogPacket = (packet) => {
    const dialogData = packet?.dialog ?? packet
    if (!dialogData) return
    const text = extractText(dialogData)
    let classification = classifyAuthPrompt(dialogData, !bot.autoAuth.hasRegistered)
    const actionId = findPreJoinAction(dialogData, classification)
    if (/(?:prejoin-)?login\//.test(actionId || '')) classification = 'login'
    if (/(?:prejoin-)?register\//.test(actionId || '')) classification = 'register'
    const isSupportedPreJoin =
      /^authme:prejoin-(?:login|register)\/submit$/.test(actionId || '') ||
      /^nlogin:(?:login|register)\/(?:yes|submit)$/.test(actionId || '')

    if (
      isSupportedPreJoin &&
      (typeof client?.writeRaw === 'function' || typeof client?.write === 'function')
    ) {
      const countKey = classification === 'register' ? 'registerCount' : 'loginCount'
      if (bot.autoAuth[countKey] >= bot.autoAuth.maxAttempts) return
      try {
        const fields = createDialogFields(dialogData, classification, password, email)
        if (typeof client.writeRaw === 'function' && client.state === 'configuration') {
          client.writeRaw(createCustomClickActionPacket(actionId, fields))
        } else {
          client.write('custom_click_action', {
            id: actionId,
            nbt: createDialogResponse(dialogData, classification, password, email)
          })
        }
        bot.autoAuth.authenticated = false
        bot.autoAuth.lastAction = classification
        bot.autoAuth.lastActionTime = Date.now()
        bot.autoAuth[countKey]++
        bot.autoAuth.phase = 'prejoin-submitted'
        logEvent(username, 'chat', `[Auto-Auth] Pre-join ${classification} form submitted.`)
      } catch (error) {
        logEvent(username, 'chat', `[Auto-Auth] Pre-join form failed: ${error.message}`)
      }
      return
    }

    execute(classification, text, bot.autoAuth.lastAction !== classification)
  }

  bot.on('messagestr', handleIncomingText)
  bot.on('actionBar', handleIncomingText)
  bot.on('title', handleIncomingText)

  if (client) {
    // minecraft-protocol packet names are snake_case. Keep aliases for test/proxy adapters.
    for (const event of [
      'system_chat',
      'player_chat',
      'chat',
      'set_title_text',
      'set_subtitle_text',
      'set_action_bar_text'
    ]) {
      client.on(event, handleIncomingText)
    }
    client.on('show_dialog', handleDialogPacket)
    client.on('packet_show_dialog', handleDialogPacket)
    client.on('respawn', () => {
      bot.autoAuth.authenticated = false
      bot.autoAuth.phase = 'server-switch'
      bot.autoAuth.lastAction = null
      bot.autoAuth.lastActionTime = 0
    })
  }

  bot.once('end', () => {
    for (const timer of timers) clearTimeout(timer)
    timers.clear()
  })
}
