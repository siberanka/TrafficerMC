import crypto from 'crypto'

const sendQueues = new WeakMap()
const lastSendTimes = new WeakMap()

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

function waitForPlay(bot, timeoutMs) {
  const client = bot?._client
  if (!client || client.ended || client.state === 'play')
    return Promise.resolve(client?.state === 'play')
  return new Promise((resolve) => {
    let settled = false
    const finish = (ready) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      client.off?.('state', onState)
      bot.off?.('end', onEnd)
      resolve(ready)
    }
    const onState = (state) => state === 'play' && finish(true)
    const onEnd = () => finish(false)
    const timer = setTimeout(() => finish(false), timeoutMs)
    client.on?.('state', onState)
    bot.once?.('end', onEnd)
  })
}

function enqueueBotSend(bot, task) {
  const previous = sendQueues.get(bot) || Promise.resolve()
  const current = previous.catch(() => false).then(task)
  sendQueues.set(bot, current)
  const cleanup = () => {
    if (sendQueues.get(bot) === current) sendQueues.delete(bot)
  }
  current.then(cleanup, cleanup)
  return current
}

/**
 * Queues chat per bot and delegates packet selection/signing to minecraft-protocol.
 * Hand-written modern chat packets are deliberately avoided: their checksum and
 * acknowledgement schemas vary between protocol releases.
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

  return enqueueBotSend(bot, async () => {
    const client = bot._client
    const ready = await waitForPlay(bot, Math.max(250, Number(options.readyTimeout ?? 10000)))
    if (!ready || !client || client.ended) {
      options.onFailed?.(formatted, bot, 'Connection is not in play state')
      return false
    }

    const minimumInterval = Math.max(0, Number(options.minimumInterval ?? 50))
    const remaining = minimumInterval - (Date.now() - (lastSendTimes.get(bot) || 0))
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining))
    if (client.ended || client.state !== 'play') {
      options.onFailed?.(formatted, bot, 'Connection left play state before send')
      return false
    }

    try {
      // bot.chat and client.chat both use minecraft-protocol's version-aware _signedChat path.
      if (typeof bot.chat === 'function') bot.chat(formatted)
      else if (typeof client.chat === 'function') client.chat(formatted)
      else if (typeof client._signedChat === 'function') client._signedChat(formatted)
      else if (typeof client.write === 'function' && !bot.supportFeature?.('signedChat')) {
        client.write('chat', { message: formatted })
      } else {
        options.onFailed?.(formatted, bot, 'No protocol-safe chat sender is available')
        return false
      }
      lastSendTimes.set(bot, Date.now())
      options.onSent?.(formatted, bot)
      return true
    } catch (error) {
      options.onFailed?.(formatted, bot, error.message || String(error))
      return false
    }
  })
}
