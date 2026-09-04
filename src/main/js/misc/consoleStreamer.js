/**
 * ConsoleStreamer & ConsoleManager
 * Manages synchronized server console chat logging across multiple bots:
 * 1. Primary Lead Bot Election: Streams public server broadcasts exclusively from the first connected bot.
 * 2. Dynamic Failover: Automatically promotes the next connected bot to lead when the current lead disconnects or gets kicked.
 * 3. Universal Private Message Detection: Detects whispers, PMs, tells, and bot-directed messages across ANY bot and routes them with attribution.
 * 4. Deduplication & Zero Echo: Discards redundant public server broadcasts from non-lead worker bots.
 */

export class ConsoleManager {
  constructor() {
    this.connectedBotsOrder = [] // Array of bot usernames in connection order
    this.primaryBot = null // Current lead bot username
    this.botMeta = new Map() // Map<username, { connectedAt: number, isSpawned: boolean }>
  }

  /**
   * Called when a bot successfully connects or spawns on the server.
   * @param {string} username
   * @returns {{ leadChanged: boolean, primaryBot: string, isNewLead: boolean }}
   */
  onBotConnected(username) {
    if (!username) return { leadChanged: false, primaryBot: this.primaryBot, isNewLead: false }
    const uname = String(username).trim()

    if (!this.connectedBotsOrder.includes(uname)) {
      this.connectedBotsOrder.push(uname)
    }

    if (!this.botMeta.has(uname)) {
      this.botMeta.set(uname, { connectedAt: Date.now(), isSpawned: true })
    }

    let leadChanged = false
    let isNewLead = false

    if (!this.primaryBot) {
      this.primaryBot = uname
      leadChanged = true
      isNewLead = true
    }

    return { leadChanged, primaryBot: this.primaryBot, isNewLead }
  }

  /**
   * Called when a bot disconnects, leaves, or is kicked.
   * @param {string} username
   * @returns {{ leadChanged: boolean, oldLead: string|null, newLead: string|null }}
   */
  onBotDisconnected(username) {
    if (!username) return { leadChanged: false, oldLead: null, newLead: this.primaryBot }
    const uname = String(username).trim()

    const idx = this.connectedBotsOrder.indexOf(uname)
    if (idx !== -1) {
      this.connectedBotsOrder.splice(idx, 1)
    }
    this.botMeta.delete(uname)

    let leadChanged = false
    let oldLead = null
    let newLead = this.primaryBot

    if (this.primaryBot === uname) {
      oldLead = uname
      leadChanged = true
      this.primaryBot = this.connectedBotsOrder.length > 0 ? this.connectedBotsOrder[0] : null
      newLead = this.primaryBot
    }

    return { leadChanged, oldLead, newLead }
  }

  /**
   * Returns whether the given username is the current primary lead bot.
   * @param {string} username
   * @returns {boolean}
   */
  isLeadBot(username) {
    if (!username || !this.primaryBot) return false
    return String(username).trim().toLowerCase() === this.primaryBot.toLowerCase()
  }

  /**
   * Gets the current active lead bot username or null.
   */
  getLeadBot() {
    return this.primaryBot
  }

  /**
   * Returns the count of connected bots tracked in console manager.
   */
  getConnectedCount() {
    return this.connectedBotsOrder.length
  }

  /**
   * Detects if a message received by a bot is a private message, whisper, tell, or bot-specific directive.
   * @param {string} rawMsg
   * @param {string} botUsername
   * @returns {boolean}
   */
  isPrivateOrDirectedMessage(rawMsg, botUsername) {
    if (!rawMsg || typeof rawMsg !== 'string') return false
    const msg = rawMsg.trim()
    const lower = msg.toLowerCase()
    const uname = botUsername ? String(botUsername).trim() : ''
    const unameLower = uname.toLowerCase()

    // 1. Direct whisper patterns (English & Turkish)
    const whisperPatterns = [
      /whispers to you:/i,
      /whispers:/i,
      /fısıldıyor:/i,
      /fısıldadı:/i,
      /\[fısıltı\]/i,
      /\[özel\]/i,
      /\[whisper\]/i,
      /\[pm\]/i,
      /\[msg\]/i,
      /\[tell\]/i,
      /->\s*me\s*:/i,
      /->\s*you\s*:/i,
      /->\s*sana\s*:/i,
      /\[me\s*->/i,
      /\(from\s+[^)]+\)/i
    ]

    for (const pattern of whisperPatterns) {
      if (pattern.test(msg)) {
        return true
      }
    }

    // 2. Patterns that explicitly target this specific bot name
    if (unameLower) {
      // e.g. "[Player -> AlphaBot]" or "[AlphaBot <- Player]" or "To AlphaBot:"
      const nameTargetPatterns = [
        new RegExp(`->\\s*${unameLower}\\b`, 'i'),
        new RegExp(`to\\s+${unameLower}\\s*:`, 'i'),
        new RegExp(`sana\\s*\\(${unameLower}\\)`, 'i'),
        new RegExp(`@${unameLower}\\b`, 'i'),
        new RegExp(`^${unameLower}\\s*[,:]`, 'i')
      ]
      for (const pattern of nameTargetPatterns) {
        if (pattern.test(msg)) {
          return true
        }
      }
    }

    // 3. Bot authentication & security directives addressed privately to this bot
    const authDirectives = [
      /\/login\s+<password>/i,
      /\/register\s+<password>/i,
      /please\s+(?:use\s+)?\/login/i,
      /please\s+(?:use\s+)?\/register/i,
      /lütfen\s+(?:giriş\s+için\s+)?\/login/i,
      /lütfen\s+(?:kayıt\s+için\s+)?\/register/i,
      /şifrenizi\s+giriniz/i,
      /enter\s+your\s+password/i,
      /captcha:\s*/i,
      /güvenlik\s+kodu/i,
      /pin:\s*/i
    ]

    for (const pattern of authDirectives) {
      if (pattern.test(lower)) {
        return true
      }
    }

    return false
  }

  /**
   * Evaluates an incoming chat/message from any bot.
   * Determines if the message should be emitted to the console log.
   * @param {string} msg
   * @param {string} botUsername
   * @returns {{ allowed: boolean, isPrivate: boolean, isLead: boolean, leadBot: string|null }}
   */
  evaluateMessage(msg, botUsername) {
    if (!msg || typeof msg !== 'string') {
      return { allowed: false, isPrivate: false, isLead: false, leadBot: this.primaryBot }
    }

    const uname = String(botUsername).trim()
    const isPrivate = this.isPrivateOrDirectedMessage(msg, uname)

    // Rule A: If it's a private message / whisper to ANY bot, ALWAYS allow it!
    if (isPrivate) {
      return {
        allowed: true,
        isPrivate: true,
        isLead: this.isLeadBot(uname),
        leadBot: this.primaryBot
      }
    }

    // Rule B: If no lead bot is elected yet (e.g. edge case), promote this bot
    if (!this.primaryBot) {
      this.onBotConnected(uname)
    }

    // Rule C: Public messages are allowed ONLY from the primary lead bot
    if (this.isLeadBot(uname)) {
      return {
        allowed: true,
        isPrivate: false,
        isLead: true,
        leadBot: this.primaryBot
      }
    }

    // Rule D: Redundant public broadcasts from non-lead bots are silently dropped to avoid duplication
    return {
      allowed: false,
      isPrivate: false,
      isLead: false,
      leadBot: this.primaryBot
    }
  }

  /**
   * Formats the current local time as [HH:MM:SS].
   * @returns {string}
   */
  getTimestamp() {
    const now = new Date()
    const h = String(now.getHours()).padStart(2, '0')
    const m = String(now.getMinutes()).padStart(2, '0')
    const s = String(now.getSeconds()).padStart(2, '0')
    return `[${h}:${m}:${s}]`
  }

  /**
   * Resets all state (useful for tests or full disconnects).
   */
  reset() {
    this.connectedBotsOrder = []
    this.primaryBot = null
    this.botMeta.clear()
  }
}

// Global singleton instance for the main process
export const consoleManager = new ConsoleManager()
