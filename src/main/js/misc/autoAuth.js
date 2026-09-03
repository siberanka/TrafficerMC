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
 * Parses raw chat/title/dialog text from Minecraft packet payloads.
 * Handles strings, JSON objects, component arrays, and nested objects.
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
  if (Array.isArray(data)) {
    return data.map((item) => extractText(item)).join(' ')
  }
  if (typeof data === 'object') {
    let result = ''
    if (data.text) result += data.text
    if (data.value && typeof data.value === 'string') result += ' ' + data.value
    if (data.title) result += ' ' + extractText(data.title)
    if (data.body) result += ' ' + extractText(data.body)
    if (data.extra && Array.isArray(data.extra)) {
      result += ' ' + data.extra.map((e) => extractText(e)).join(' ')
    }
    if (data.with && Array.isArray(data.with)) {
      result += ' ' + data.with.map((e) => extractText(e)).join(' ')
    }
    return result.trim()
  }
  return String(data)
}

/**
 * Checks if a text indicates a registration prompt.
 */
export function isRegisterPrompt(text) {
  if (!text || typeof text !== 'string') return false
  const lower = text.toLowerCase()
  const registerKeywords = [
    '/register',
    'register',
    'kayıt',
    'kayit',
    'kaydol',
    'kayit ol',
    'kayıt ol',
    'şifrenizi belirleyin',
    'sifrenizi belirleyin',
    'parola belirle',
    'create a password',
    'set your password',
    'choose a password',
    '/reg '
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
    'login',
    'giriş',
    'giris',
    'giriş yap',
    'giris yap',
    'şifrenizi girin',
    'sifrenizi girin',
    'parolanızı girin',
    'enter your password',
    'enter password',
    '/l '
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
    lastAction: null,
    lastActionTime: 0,
    registerCount: 0,
    loginCount: 0,
    maxAttempts: 5
  }

  if (!enabled) return

  const username = bot._client?.username || bot.username || 'Bot'

  const safeChat = (cmd) => {
    try {
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

  const executeRegister = () => {
    if (bot.autoAuth.authenticated) return
    if (bot.autoAuth.registerCount >= bot.autoAuth.maxAttempts) return

    const now = Date.now()
    if (now - bot.autoAuth.lastActionTime < 1500 && bot.autoAuth.lastAction === 'register') {
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

  const executeLogin = () => {
    if (bot.autoAuth.authenticated) return
    if (bot.autoAuth.loginCount >= bot.autoAuth.maxAttempts) return

    const now = Date.now()
    if (now - bot.autoAuth.lastActionTime < 1500 && bot.autoAuth.lastAction === 'login') {
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

    if (isAuthSuccess(text)) {
      bot.autoAuth.authenticated = true
      logEvent(username, 'chat', '[Auto-Auth] Authentication successful!')
      return
    }

    if (isRegisterPrompt(text)) {
      executeRegister()
    } else if (isLoginPrompt(text)) {
      executeLogin()
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
      const text = extractText(packet.dialog || packet)
      logEvent(username, 'chat', `[Auto-Auth] Dialog received: ${text.slice(0, 60)}...`)

      if (isAuthSuccess(text)) {
        bot.autoAuth.authenticated = true
        return
      }

      if (isRegisterPrompt(text)) {
        executeRegister()
      } else if (isLoginPrompt(text)) {
        executeLogin()
      } else {
        executeLogin()
      }

      try {
        if (typeof client.write === 'function') {
          client.write('custom_click_action', {})
        }
      } catch {
        // Safe ignore
      }
    }

    client.on('packet_show_dialog', handleDialogPacket)
    client.on('show_dialog', handleDialogPacket)
  }
}
