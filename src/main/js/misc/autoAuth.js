let nbtSimplify = null
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nbt = require('prismarine-nbt')
  nbtSimplify = nbt.simplify
} catch {
  // Safe fallback if not installed directly
}

function logEvent(username, event, message) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { BrowserWindow } = require('electron')
    const win = BrowserWindow?.getAllWindows?.()[0]
    if (win) {
      win.webContents.send('botEvent', {
        id: username,
        event: event,
        message: message
      })
    }
  } catch {
    // Safe fallback in test or headless environment
  }
}

/**
 * Recursively extracts all string values from any nested object, array, NBT structure, or JSON string.
 */
export function extractAllStrings(data, bucket = []) {
  if (data === null || data === undefined) return bucket
  if (typeof data === 'string') {
    bucket.push(data)
    try {
      const parsed = JSON.parse(data)
      if (typeof parsed === 'object' && parsed !== null) {
        extractAllStrings(parsed, bucket)
      }
    } catch {
      // not JSON
    }
    return bucket
  }
  if (Array.isArray(data)) {
    for (const item of data) {
      extractAllStrings(item, bucket)
    }
    return bucket
  }
  if (typeof data === 'object') {
    // If it is an NBT compound/list tag with type and value
    if (data.type !== undefined && data.value !== undefined) {
      extractAllStrings(data.value, bucket)
      return bucket
    }
    for (const key of Object.keys(data)) {
      // Keep key names like 'confirm', 'password', 'action_key' if relevant
      extractAllStrings(data[key], bucket)
    }
  }
  return bucket
}

/**
 * Parses raw chat/title/dialog text from Minecraft packet payloads.
 * Handles strings, JSON objects, component arrays, and prismarine-nbt compounds.
 */
export function extractText(data) {
  if (!data) return ''
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data)
      return extractText(parsed)
    } catch {
      return data
    }
  }
  if (nbtSimplify && typeof data === 'object' && data.type && data.value !== undefined) {
    try {
      const simplified = nbtSimplify(data)
      return extractText(simplified)
    } catch {
      // fallback
    }
  }
  const strings = extractAllStrings(data)
  return strings.join(' ').replace(/\s+/g, ' ').trim()
}

/**
 * Checks if a text indicates a registration prompt.
 */
export function isRegisterPrompt(text) {
  if (!text || typeof text !== 'string') return false
  const lower = text.toLowerCase()
  const registerKeywords = [
    '/register',
    '/reg ',
    'register',
    'registration',
    'kayıt',
    'kayit',
    'kaydol',
    'kayit ol',
    'kayıt ol',
    'şifrenizi belirleyin',
    'sifrenizi belirleyin',
    'şifre tekrar',
    'sifre tekrar',
    'tekrarşifre',
    'tekrarsifre',
    'confirmpassword',
    'confirm_password',
    'confirm_email',
    'confirm',
    'pre_join_register',
    'create an account',
    'parola belirle',
    'create a password',
    'set your password',
    'choose a password',
    'registrieren',
    'registrarse',
    'регистрация',
    'зарегистрироваться'
  ]
  return registerKeywords.some((keyword) => lower.includes(keyword))
}

/**
 * Checks if a text indicates a login prompt.
 */
export function isLoginPrompt(text) {
  if (!text || typeof text !== 'string') return false
  const lower = text.toLowerCase()
  const loginKeywords = [
    '/login',
    '/l ',
    'login',
    'giriş',
    'giris',
    'giriş yap',
    'giris yap',
    'pre_join_login',
    'şifrenizi girin',
    'sifrenizi girin',
    'parolanızı girin',
    'enter your password',
    'enter password',
    'anmelden',
    'iniciar sesión',
    'вход',
    'авторизоваться'
  ]
  return loginKeywords.some((keyword) => lower.includes(keyword))
}

/**
 * Checks if a text indicates that authentication was successful.
 */
export function isAuthSuccess(text) {
  if (!text || typeof text !== 'string') return false
  const lower = text.toLowerCase()
  const successPatterns = [
    /successful(?:ly)?\s+log(?:ged)?\s*in/i,
    /log(?:ged)?\s*in\s+successfully/i,
    /ba[sş]ar[ıi]yla\s+.*giri[sş]\s+yapt[ıi]n[ıi]z/i,
    /ba[sş]ar[ıi]yla\s+.*kay[ıi]t/i,
    /giri[sş]\s+ba[sş]ar[ıi]l[ıi]/i,
    /giri[sş]\s+yap[ıi]ld[ıi]/i,
    /kay[ıi]t\s+ba[sş]ar[ıi]l[ıi]/i,
    /kayd[ıi]n[ıi]z\s+tamamland[ıi]/i,
    /registration\s+completed/i,
    /successful(?:ly)?\s+register(?:ed)?/i,
    /ho[sş]\s*geldin(?:iz)?/i,
    /welcome\s+back/i
  ]
  return successPatterns.some((pattern) => pattern.test(lower))
}

/**
 * Classifies an AuthMe authentication prompt based on bytecode/protocol analysis:
 * - Pre-join action keys (pre_join_register_submit vs pre_join_login_submit)
 * - Input fields (confirm, confirm_password, email)
 * - Template commands (register $(...) vs login $(...))
 * - Multilingual keyword matches & server feedback loops
 */
export function classifyAuthPrompt(dataOrText, isNewUser = true) {
  const text = typeof dataOrText === 'string' ? dataOrText : extractText(dataOrText)
  if (!text) {
    return isNewUser ? 'register' : 'login'
  }
  const lower = text.toLowerCase()

  // 1. Success check
  if (isAuthSuccess(lower)) {
    return 'success'
  }

  // 2. Server feedback transition:
  // "This user isn't registered!" / "Bu oyuncu kayitli degil!" -> Immediate switch to register
  if (
    lower.includes("isn't registered") ||
    lower.includes('is not registered') ||
    lower.includes('not registered') ||
    lower.includes('kayitli degil') ||
    lower.includes('kayıtlı değil') ||
    lower.includes('unregistered')
  ) {
    return 'register'
  }

  // "You already have registered this username!" / "Zaten kayitlisin" -> Immediate switch to login
  if (
    lower.includes('already have registered') ||
    lower.includes('already registered') ||
    lower.includes('zaten kayit') ||
    lower.includes('zaten kayıt') ||
    lower.includes('name_taken')
  ) {
    return 'login'
  }

  // "You're already logged in!" / "Zaten giris yaptin!"
  if (
    lower.includes('already logged in') ||
    lower.includes('zaten giris') ||
    lower.includes('zaten giriş')
  ) {
    return 'success'
  }

  // 3. Confirm indicator -> exclusively registration (AuthMe PaperDialog and command syntax)
  if (
    lower.includes('confirm') ||
    lower.includes('tekrar') ||
    lower.includes('pre_join_register')
  ) {
    return 'register'
  }

  // 4. Pre-join login action key
  if (lower.includes('pre_join_login')) {
    return 'login'
  }

  // 5. Keyword analysis
  const hasRegister = isRegisterPrompt(lower)
  const hasLogin = isLoginPrompt(lower)

  if (hasRegister && !hasLogin) {
    return 'register'
  }
  if (hasLogin && !hasRegister) {
    return 'login'
  }
  if (hasRegister && hasLogin) {
    // Both present (e.g. server banner showing "/register <pass> or /login <pass>"):
    // If bot has not registered on this server, register!
    return isNewUser ? 'register' : 'login'
  }

  return isNewUser ? 'register' : 'login'
}

/**
 * Mineflayer Auto-Auth Plugin for AuthMe Reloaded
 * Works with chat, titles, actionbars, and 1.21.6+ / 1.21.11+ / 26.x packet_show_dialog pre-login dialogs.
 */
export function autoAuth(bot, options = {}) {
  const enabled = options.enabled ?? false
  const password = options.password || 'trafficermc123a'
  const actionDelay = options.delay || 600

  bot.autoAuth = {
    enabled,
    password,
    authenticated: false,
    hasRegistered: false,
    lastAction: null,
    lastActionTime: 0,
    registerCount: 0,
    loginCount: 0,
    maxAttempts: 5
  }

  if (!enabled) return

  const username = bot._client?.username || bot.username || 'Bot'

  let isSpawned = false
  bot.once('spawn', () => {
    isSpawned = true
  })

  const safeChat = (cmd) => {
    try {
      if (!isSpawned && !bot.entity) {
        bot.once('spawn', () => {
          setTimeout(() => safeChat(cmd), 200)
        })
        return
      }
      if (typeof bot.chat === 'function') {
        bot.chat(cmd)
      } else if (bot._client && typeof bot._client.write === 'function') {
        try {
          bot._client.write('chat_command', { command: cmd.startsWith('/') ? cmd.slice(1) : cmd })
        } catch {
          bot._client.write('chat_message', { message: cmd })
        }
      }
    } catch (err) {
      console.error(`[Auto-Auth] Error sending command ${cmd}:`, err.message)
    }
  }

  const executeRegister = (force = false) => {
    if (bot.autoAuth.authenticated) return
    if (bot.autoAuth.registerCount >= bot.autoAuth.maxAttempts) return

    const now = Date.now()
    if (
      !force &&
      now - bot.autoAuth.lastActionTime < 1500 &&
      bot.autoAuth.lastAction === 'register'
    ) {
      return
    }

    bot.autoAuth.lastAction = 'register'
    bot.autoAuth.lastActionTime = now
    bot.autoAuth.registerCount++

    setTimeout(() => {
      if (bot.autoAuth.authenticated) return
      const cmd = `/register ${bot.autoAuth.password} ${bot.autoAuth.password}`
      safeChat(cmd)
      logEvent(username, 'chat', `[Auto-Auth] Registering with password: ${bot.autoAuth.password}`)
    }, actionDelay)
  }

  const executeLogin = (force = false) => {
    if (bot.autoAuth.authenticated) return
    if (bot.autoAuth.loginCount >= bot.autoAuth.maxAttempts) return

    const now = Date.now()
    if (!force && now - bot.autoAuth.lastActionTime < 1500 && bot.autoAuth.lastAction === 'login') {
      return
    }

    bot.autoAuth.lastAction = 'login'
    bot.autoAuth.lastActionTime = now
    bot.autoAuth.loginCount++

    setTimeout(() => {
      if (bot.autoAuth.authenticated) return
      const cmd = `/login ${bot.autoAuth.password}`
      safeChat(cmd)
      logEvent(username, 'chat', `[Auto-Auth] Logging in with password: ${bot.autoAuth.password}`)
    }, actionDelay)
  }

  const handleIncomingText = (rawText) => {
    if (!rawText || bot.autoAuth.authenticated) return
    const text = extractText(rawText)
    if (!text) return

    const isNewUser = !bot.autoAuth.hasRegistered && bot.autoAuth.registerCount === 0
    const classification = classifyAuthPrompt(rawText, isNewUser)

    if (classification === 'success') {
      bot.autoAuth.authenticated = true
      bot.emit('authSuccess')
      logEvent(username, 'chat', '[Auto-Auth] Authentication successful!')
      return
    }

    if (classification === 'register') {
      executeRegister(bot.autoAuth.lastAction === 'login')
    } else if (classification === 'login') {
      executeLogin(bot.autoAuth.lastAction === 'register')
    }
  }

  // 1. Messagestr listener (Standard Mineflayer Chat)
  bot.on('messagestr', (message) => {
    handleIncomingText(message)
  })

  // 2. Underlying Client Packet Listeners (Raw Chat, Titles, Dialogs)
  const client = bot._client
  if (client) {
    client.on('system_chat', (data) => {
      const content = data?.content || data?.message || data
      handleIncomingText(content)
    })

    client.on('player_chat', (data) => {
      const content = data?.plainMessage || data?.unsignedContent || data?.formattedText
      handleIncomingText(content)
    })

    client.on('chat', (data) => {
      const content = data?.message || data
      handleIncomingText(content)
    })

    client.on('set_title_text', (data) => {
      handleIncomingText(data?.text || data)
    })

    client.on('set_subtitle_text', (data) => {
      handleIncomingText(data?.text || data)
    })

    client.on('set_action_bar_text', (data) => {
      handleIncomingText(data?.text || data)
    })

    client.on('title', (data) => {
      handleIncomingText(data?.text || data)
    })

    // 3. Modern AuthMe Reloaded Dialog Packets (1.21.6+, 1.21.11+, 26.x)
    const handleDialogPacket = (packet) => {
      if (!packet || bot.autoAuth.authenticated) return
      const dialogData = packet.dialog || packet
      const text = extractText(dialogData)
      logEvent(username, 'chat', `[Auto-Auth] Dialog received: ${text.slice(0, 60)}...`)

      const isNewUser = !bot.autoAuth.hasRegistered && bot.autoAuth.registerCount === 0
      const classification = classifyAuthPrompt(dialogData, isNewUser)

      if (classification === 'success') {
        bot.autoAuth.authenticated = true
        bot.emit('authSuccess')
        return
      }

      if (classification === 'register') {
        executeRegister(bot.autoAuth.lastAction === 'login')
      } else if (classification === 'login') {
        executeLogin(bot.autoAuth.lastAction === 'register')
      }
    }

    client.on('packet_show_dialog', handleDialogPacket)
    client.on('show_dialog', handleDialogPacket)
  }
}
