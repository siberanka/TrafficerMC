import crypto from 'crypto'

/**
 * Leet speak dictionary
 */
const LEET_MAP = {
  a: '4',
  A: '4',
  e: '3',
  E: '3',
  i: '1',
  I: '1',
  o: '0',
  O: '0',
  s: '5',
  S: '5',
  t: '7',
  T: '7',
  b: '8',
  B: '8',
  g: '9',
  G: '9'
}

/**
 * Generates a random alphanumeric string with mixed casing (e.g. "rAndOm", "4k9L")
 * Length is between minLen and maxLen (defaults to 3-6 characters)
 */
export function generateRandomTag(minLen = 3, maxLen = 6) {
  const length = crypto.randomInt(minLen, maxLen + 1)
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars[crypto.randomInt(0, chars.length)]
  }
  return result
}

/**
 * Converts text based on selected converter (matching LiquidBounce / LiquidLauncher Spammer)
 * Supported: 'none', 'leet', 'random_case', 'random_space'
 */
export function applyMessageConverter(text, converter = 'none') {
  if (!text || typeof text !== 'string') return ''

  // If text is a command, do not mutate command name or structure
  if (text.startsWith('/')) {
    return text
  }

  switch (converter?.toLowerCase()) {
    case 'leet':
      return text
        .split('')
        .map((ch) => LEET_MAP[ch] || ch)
        .join('')

    case 'random_case':
    case 'random case':
      return text
        .split('')
        .map((ch) => {
          if (/[a-zA-Z]/.test(ch)) {
            return Math.random() > 0.5 ? ch.toUpperCase() : ch.toLowerCase()
          }
          return ch
        })
        .join('')

    case 'random_space':
    case 'random space':
      return text
        .split(' ')
        .map((word) => {
          if (word.length <= 1) return word
          // Add random extra spaces inside or around words
          return word
            .split('')
            .map((char, idx) => (idx > 0 && Math.random() > 0.65 ? ' ' + char : char))
            .join('')
        })
        .join(' ')

    case 'none':
    default:
      return text
  }
}

/**
 * Applies custom formatting, prefix/suffix anti-spam bypass tags, and variable placeholders
 * LiquidBounce style: [rAndOm] prefix or suffix (3-6 chars)
 */
export function applyCustomFormatter(text, options = {}, context = {}) {
  if (!text || typeof text !== 'string') return ''

  const username = context.username || 'Bot'
  const count = context.count ?? 1
  const time = new Date().toLocaleTimeString()

  // Replace variable placeholders
  let formatted = text
    .replaceAll('{random}', generateRandomTag(3, 6))
    .replaceAll('%random%', generateRandomTag(3, 6))
    .replaceAll('{player}', username)
    .replaceAll('%player%', username)
    .replaceAll('{time}', time)
    .replaceAll('%time%', time)
    .replaceAll('{count}', String(count))
    .replaceAll('%count%', String(count))
    .replaceAll('%uuid%', generateRandomTag(8, 8))

  // Commands must NEVER have anti-spam prefix or suffix added to them!
  if (formatted.startsWith('/')) {
    return formatted
  }

  // Apply converter (Leet, Random Case, Random Space)
  if (options.converter && options.converter !== 'none') {
    formatted = applyMessageConverter(formatted, options.converter)
  }

  // Anti-Spam Tag / Bypass / Custom Formatter
  const enableFormatter = options.customFormatter || options.bypass || options.bypassChat
  if (enableFormatter) {
    const position = (options.formatterPosition || 'suffix').toLowerCase()
    const tag = `[${generateRandomTag(3, 6)}]`

    if (position === 'prefix') {
      formatted = `${tag} ${formatted}`
    } else if (position === 'both') {
      const tag2 = `[${generateRandomTag(3, 6)}]`
      formatted = `${tag} ${formatted} ${tag2}`
    } else {
      // Default: suffix
      formatted = `${formatted} ${tag}`
    }
  }

  return formatted
}

/**
 * Selects the next message from the messages array based on pattern ('random' | 'sequence')
 */
export function getNextMessage(messages, pattern = 'random', state = { index: 0 }) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return ''
  }

  const cleanList = messages.map((m) => (typeof m === 'string' ? m.trim() : '')).filter(Boolean)
  if (cleanList.length === 0) return ''

  if (pattern === 'sequence') {
    const msg = cleanList[state.index % cleanList.length]
    state.index++
    return msg
  }

  // Default: random
  const randomIndex = crypto.randomInt(0, cleanList.length)
  return cleanList[randomIndex]
}

/**
 * Sends a chat message or command safely across all Minecraft protocols (1.8 - 26.x).
 * - Ensures bot is spawned.
 * - Handles commands (/...) using chat_command or bot.chat.
 * - Handles regular messages using chat_message or bot.chat.
 * - Never throws uncaught exceptions.
 */
export async function sendBotMessage(bot, rawMessage, options = {}) {
  if (!bot || !rawMessage) return false

  const isCommand = typeof rawMessage === 'string' && rawMessage.trim().startsWith('/')

  let formatted = typeof rawMessage === 'string' ? rawMessage.trim() : String(rawMessage)

  if (isCommand) {
    // Commands must NEVER have anti-spam prefix or suffix added to them!
    const username = bot._client?.username || bot.username || 'Bot'
    formatted = formatted.replaceAll('{player}', username).replaceAll('%player%', username)
  } else {
    const hasFormatting =
      (options.converter && options.converter !== 'none') ||
      options.customFormatter ||
      options.bypass ||
      options.bypassChat

    if (hasFormatting) {
      formatted = applyCustomFormatter(formatted, options, {
        username: bot._client?.username || bot.username,
        count: options.counter || 1
      })
    }
  }

  if (!formatted) return false

  const isSpawned = !!(
    bot.entity ||
    bot._client?.state === 'play' ||
    bot._client?.socket?.writable ||
    bot.spawned
  )

  const executeSend = () => {
    let sent = false
    try {
      if (formatted.startsWith('/')) {
        const cmd = formatted.slice(1)
        if (typeof bot.chat === 'function') {
          bot.chat(formatted)
          sent = true
        } else if (bot._client && typeof bot._client.write === 'function') {
          bot._client.write('chat_command', { command: cmd })
          sent = true
        }
      } else {
        if (typeof bot.chat === 'function') {
          bot.chat(formatted)
          sent = true
        } else if (bot._client && typeof bot._client.write === 'function') {
          bot._client.write('chat_message', { message: formatted })
          sent = true
        }
      }
    } catch (err) {
      // Fallback direct write if bot.chat threw error
      try {
        if (bot._client && typeof bot._client.write === 'function') {
          if (formatted.startsWith('/')) {
            bot._client.write('chat_command', { command: formatted.slice(1) })
          } else {
            bot._client.write('chat_message', { message: formatted })
          }
          sent = true
        }
      } catch (_) {}
    }

    if (sent && typeof options.onSent === 'function') {
      try {
        options.onSent(formatted, bot)
      } catch (_) {}
    }

    return sent
  }

  if (isSpawned) {
    return executeSend()
  } else {
    // Wait until spawn to dispatch, with safety timeout to avoid hanging
    return new Promise((resolve) => {
      let resolved = false
      const done = (res) => {
        if (!resolved) {
          resolved = true
          resolve(res)
        }
      }

      const timer = setTimeout(() => {
        done(executeSend())
      }, 1500)

      bot.once('spawn', () => {
        clearTimeout(timer)
        setTimeout(() => {
          done(executeSend())
        }, 100)
      })
    })
  }
}
