import assert from 'assert'
import EventEmitter from 'events'
import nbt from 'prismarine-nbt'
import {
  extractText,
  isRegisterPrompt,
  isLoginPrompt,
  isAuthSuccess,
  createCustomClickActionPacket,
  autoAuth
} from '../src/main/js/misc/autoAuth.js'

console.log('--- Testing Auto-Auth Module ---')

// 1. Test Text Extraction
assert.strictEqual(extractText('plain string'), 'plain string')
assert.strictEqual(extractText('{"text":"json text"}'), 'json text')
assert.strictEqual(extractText({ text: 'Hello', extra: [{ text: 'World' }] }), 'Hello World')
assert.strictEqual(
  extractText({ title: { text: 'Dialog Title' }, body: { text: 'Dialog Body' } }),
  'Dialog Title Dialog Body'
)

// 2. Test Prompt Detection
assert.strictEqual(isRegisterPrompt('Please register with /register <password> <password>'), true)
assert.strictEqual(isRegisterPrompt('Kayıt olmak için: /register <şifre> <şifre>'), true)
assert.strictEqual(isRegisterPrompt('Lütfen /register şifre şifre yazın'), true)
assert.strictEqual(isRegisterPrompt('Welcome to Trafficer Server'), false)

assert.strictEqual(isLoginPrompt('Please login with /login <password>'), true)
assert.strictEqual(isLoginPrompt('Giriş yapmak için: /login <şifre>'), true)
assert.strictEqual(isLoginPrompt('Lütfen şifrenizi girin: /login <şifre>'), true)
assert.strictEqual(isLoginPrompt('Just chatting in server'), false)

assert.strictEqual(isAuthSuccess('Successfully logged in!'), true)
assert.strictEqual(isAuthSuccess('Başarıyla giriş yaptınız.'), true)
assert.strictEqual(isAuthSuccess('Hoşgeldiniz!'), true)
assert.strictEqual(isAuthSuccess('Welcome back'), true)
assert.strictEqual(isAuthSuccess('Please enter your password'), false)

// 3. Test Plugin Disabled State
{
  class MockBot extends EventEmitter {
    constructor() {
      super()
      this._client = new EventEmitter()
      this._client.username = 'TestBot'
      this.chatCommands = []
      this.entity = { id: 1 }
    }
    chat(cmd) {
      this.chatCommands.push(cmd)
    }
  }

  const disabledBot = new MockBot()
  autoAuth(disabledBot, { enabled: false, password: 'trafficermc123a' })
  disabledBot.emit('messagestr', 'Please register with /register <password>')
  assert.strictEqual(disabledBot.autoAuth.enabled, false)
  assert.strictEqual(disabledBot.chatCommands.length, 0)
}

// 4. Test Plugin Enabled State: Register flow
{
  class MockBot extends EventEmitter {
    constructor() {
      super()
      this._client = new EventEmitter()
      this._client.username = 'TestBot'
      this.chatCommands = []
      this.entity = { id: 1 }
    }
    chat(cmd) {
      this.chatCommands.push(cmd)
    }
  }

  const bot = new MockBot()
  autoAuth(bot, { enabled: true, password: 'trafficermc123a', delay: 10 })

  bot.emit('messagestr', 'Please register with /register <password> <password>')

  setTimeout(() => {
    assert.strictEqual(bot.chatCommands.length, 1)
    assert.strictEqual(bot.chatCommands[0], '/register trafficermc123a trafficermc123a')
    console.log('✓ Register chat test passed')
  }, 50)
}

// 5. Test Plugin Enabled State: Dialog flow (AuthMe 1.21.6+ / 1.21.11+ / 26.x packet_show_dialog)
{
  class MockBot extends EventEmitter {
    constructor() {
      super()
      this._client = new EventEmitter()
      this._client.username = 'TestBot'
      this.chatCommands = []
      this.entity = { id: 1 }
    }
    chat(cmd) {
      this.chatCommands.push(cmd)
    }
  }

  const bot = new MockBot()
  autoAuth(bot, { enabled: true, password: 'trafficermc123a', delay: 10 })

  bot._client.emit('packet_show_dialog', {
    dialog: {
      title: 'AuthMe Reloaded Login',
      body: 'Lütfen /login <şifre> ile giriş yapınız'
    }
  })

  setTimeout(() => {
    assert.strictEqual(bot.chatCommands.length, 1)
    assert.strictEqual(bot.chatCommands[0], '/login trafficermc123a')
    console.log('✓ Dialog packet test passed')
  }, 50)
}

// 6. Test Title packet flow
{
  class MockBot extends EventEmitter {
    constructor() {
      super()
      this._client = new EventEmitter()
      this._client.username = 'TestBot'
      this.chatCommands = []
      this.entity = { id: 1 }
    }
    chat(cmd) {
      this.chatCommands.push(cmd)
    }
  }

  const bot = new MockBot()
  autoAuth(bot, { enabled: true, password: 'trafficermc123a', delay: 10 })

  bot._client.emit('set_title_text', {
    text: 'Giriş Yapmak İçin /login <şifre>'
  })

  setTimeout(() => {
    assert.strictEqual(bot.chatCommands.length, 1)
    assert.strictEqual(bot.chatCommands[0], '/login trafficermc123a')
    console.log('✓ Title packet test passed')
  }, 50)
}

// 7. Test Actionbar packet flow & Success authentication
{
  class MockBot extends EventEmitter {
    constructor() {
      super()
      this._client = new EventEmitter()
      this._client.username = 'TestBot'
      this.chatCommands = []
      this.entity = { id: 1 }
    }
    chat(cmd) {
      this.chatCommands.push(cmd)
    }
  }

  const bot = new MockBot()
  autoAuth(bot, { enabled: true, password: 'trafficermc123a', delay: 10 })

  bot._client.emit('set_action_bar_text', {
    text: 'Kayıt Ol: /register <şifre> <şifre>'
  })

  setTimeout(() => {
    assert.strictEqual(bot.chatCommands.length, 1)
    assert.strictEqual(bot.chatCommands[0], '/register trafficermc123a trafficermc123a')

    // Now simulate success message
    bot.emit('messagestr', 'Başarıyla kayıt oldunuz ve giriş yaptınız.')
    assert.strictEqual(bot.autoAuth.authenticated, true)

    // Further prompts should be ignored
    bot.emit('messagestr', 'Please login with /login <password>')
    setTimeout(() => {
      assert.strictEqual(
        bot.chatCommands.length,
        1,
        'No additional commands should be sent once authenticated'
      )
      console.log('✓ Actionbar and auth success flow passed')
    }, 50)
  }, 50)
}

// 8. Test AuthMe Pre-Join NBT Compound Dialog with confirm input & action key
{
  class MockBot extends EventEmitter {
    constructor() {
      super()
      this._client = new EventEmitter()
      this._client.username = 'NewBot'
      this.chatCommands = []
      this.entity = { id: 2 }
    }
    chat(cmd) {
      this.chatCommands.push(cmd)
    }
  }

  const bot = new MockBot()
  autoAuth(bot, { enabled: true, password: 'trafficermc123a', delay: 10 })

  // AuthMe sends packet_show_dialog with NBT compound
  bot._client.emit('packet_show_dialog', {
    dialog: {
      type: 'compound',
      value: {
        title: { type: 'string', value: '&6Register' },
        action_key: { type: 'string', value: 'authme:pre_join_register_submit' },
        inputs: {
          type: 'list',
          value: {
            type: 'compound',
            value: [
              { name: { type: 'string', value: 'password' } },
              { name: { type: 'string', value: 'confirm' } }
            ]
          }
        }
      }
    }
  })

  setTimeout(() => {
    assert.strictEqual(bot.chatCommands.length, 1)
    assert.strictEqual(
      bot.chatCommands[0],
      '/register trafficermc123a trafficermc123a',
      'Bot must register on AuthMe pre-join register dialog'
    )
    console.log('✓ AuthMe Pre-Join NBT Compound Register Dialog test passed')
  }, 50)
}

// 9. Test First Join Ambiguous Dialog -> must default to register, NOT login
{
  class MockBot extends EventEmitter {
    constructor() {
      super()
      this._client = new EventEmitter()
      this._client.username = 'BrandNewBot'
      this.chatCommands = []
      this.entity = { id: 3 }
    }
    chat(cmd) {
      this.chatCommands.push(cmd)
    }
  }

  const bot = new MockBot()
  autoAuth(bot, { enabled: true, password: 'trafficermc123a', delay: 10 })

  bot._client.emit('packet_show_dialog', {
    dialog: {
      type: 'compound',
      value: {
        title: { type: 'string', value: 'Server Authentication' }
      }
    }
  })

  setTimeout(() => {
    assert.strictEqual(bot.chatCommands.length, 1)
    assert.strictEqual(
      bot.chatCommands[0],
      '/register trafficermc123a trafficermc123a',
      'Ambiguous dialog on first join MUST prioritize register over login'
    )
    console.log('✓ First join ambiguous dialog prioritizes register passed')
  }, 50)
}

// 10. Test Server Feedback Transitions: unregistered user error switches to register
{
  class MockBot extends EventEmitter {
    constructor() {
      super()
      this._client = new EventEmitter()
      this._client.username = 'RetryBot'
      this.chatCommands = []
      this.entity = { id: 4 }
    }
    chat(cmd) {
      this.chatCommands.push(cmd)
    }
  }

  const bot = new MockBot()
  autoAuth(bot, { enabled: true, password: 'trafficermc123a', delay: 10 })

  // Trigger login
  bot.emit('messagestr', 'Please login with /login <password>')

  setTimeout(() => {
    assert.strictEqual(bot.chatCommands[0], '/login trafficermc123a')

    // Server sends: This user isn't registered!
    bot.emit('messagestr', "This user isn't registered!")

    setTimeout(() => {
      assert.strictEqual(
        bot.chatCommands[1],
        '/register trafficermc123a trafficermc123a',
        'Should switch immediately to register upon receiving unregistered error'
      )
      console.log('✓ Server feedback transition (login -> register) passed')
    }, 50)
  }, 50)
}

// 11. Test Server Feedback Transitions: already registered switches to login
{
  class MockBot extends EventEmitter {
    constructor() {
      super()
      this._client = new EventEmitter()
      this._client.username = 'RegBot'
      this.chatCommands = []
      this.entity = { id: 5 }
    }
    chat(cmd) {
      this.chatCommands.push(cmd)
    }
  }

  const bot = new MockBot()
  autoAuth(bot, { enabled: true, password: 'trafficermc123a', delay: 10 })

  // Trigger register
  bot.emit('messagestr', 'Please register with /register <password>')

  setTimeout(() => {
    assert.strictEqual(bot.chatCommands[0], '/register trafficermc123a')

    // Server sends: You already have registered this username!
    bot.emit('messagestr', 'You already have registered this username!')

    setTimeout(() => {
      assert.strictEqual(
        bot.chatCommands[1],
        '/login trafficermc123a',
        'Should switch immediately to login upon receiving already registered error'
      )
      console.log('✓ Server feedback transition (register -> login) passed')
    }, 50)
  }, 50)
}

console.log('✓ All Auto-Auth unit tests setup complete and running!')

// The custom-click payload is length-prefixed NBT, not a Boolean optional value.
{
  const action = 'authme:prejoin-login/submit'
  const packet = createCustomClickActionPacket(action, { password: 'safe-test-password' })
  const payloadLengthOffset = 2 + Buffer.byteLength(action)
  assert.strictEqual(packet[0], 0x08, 'Configuration custom-click packet id must be 0x08')
  assert.strictEqual(packet[1], Buffer.byteLength(action))
  assert.strictEqual(
    packet[payloadLengthOffset],
    packet.length - payloadLengthOffset - 1,
    'NBT byte length must prefix the entire anonymous compound'
  )
}

// 12. AuthMe 6 Paper pre-join forms must be answered during CONFIGURATION,
// without attempting an invalid chat command before PLAY.
{
  class ConfigurationBot extends EventEmitter {
    constructor() {
      super()
      this._client = new EventEmitter()
      this._client.username = 'PreJoinBot'
      this._client.state = 'configuration'
      this._client.ended = false
      this.writes = []
      this.chats = []
      this._client.write = (name, data) => this.writes.push({ name, data })
    }
    chat(command) {
      this.chats.push(command)
    }
  }

  const bot = new ConfigurationBot()
  autoAuth(bot, { enabled: true, password: 'safe-test-password', delay: 0 })
  bot._client.emit('show_dialog', {
    dialog: nbt.comp({
      title: nbt.string('Register'),
      password: nbt.string('password'),
      confirm: nbt.string('confirm'),
      action: nbt.string('authme:prejoin-register/submit')
    })
  })

  assert.strictEqual(bot.chats.length, 0, 'Pre-join flow must not send a chat packet')
  assert.strictEqual(bot.writes.length, 1)
  assert.strictEqual(bot.writes[0].name, 'custom_click_action')
  assert.strictEqual(bot.writes[0].data.id, 'authme:prejoin-register/submit')
  assert.deepStrictEqual(nbt.simplify(bot.writes[0].data.nbt), {
    password: 'safe-test-password',
    confirm: 'safe-test-password'
  })
  assert.strictEqual(bot.autoAuth.phase, 'prejoin-submitted')
  console.log('✓ AuthMe 6 configuration-phase pre-join form submission passed')
}
