import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { autoAuth } from '../../../src/main/js/misc/autoAuth.js'

const password = 'matrix-safe-password'

class MockClient extends EventEmitter {
  constructor(state = 'play') {
    super()
    this.state = state
    this.username = 'AuthMatrixBot'
    this.ended = false
    this.rawPackets = []
  }

  writeRaw(buffer) {
    this.rawPackets.push(buffer)
  }
}

class MockBot extends EventEmitter {
  constructor(state = 'play') {
    super()
    this._client = new MockClient(state)
    this.entity = state === 'play' ? { id: 1 } : null
    this.commands = []
  }

  chat(command) {
    this.commands.push(command)
  }
}

const cases = [
  [
    'AuthMe',
    'Please register using /register <password> <confirmPassword>',
    `/register ${password} ${password}`
  ],
  ['nLogin', 'Use /login <senha> para entrar.', `/login ${password}`],
  ['OpeNLogin', 'Registre-se com /register <senha> <senha>', `/register ${password} ${password}`],
  ['LoginSecurity', 'Please log in with /login <password>', `/login ${password}`],
  [
    'LimboAuth',
    'Use /register <password> <password> to continue',
    `/register ${password} ${password}`
  ],
  [
    'LibreLogin',
    'Registrarse: /register <contrasena> <contrasena>',
    `/register ${password} ${password}`
  ],
  [
    'mLogin',
    'Create your account: /register <password> <confirmPassword>',
    `/register ${password} ${password}`
  ],
  ['JPremium', 'Please login using /login <password>', `/login ${password}`]
]

for (const [plugin, prompt, expected] of cases) {
  const bot = new MockBot()
  autoAuth(bot, { enabled: true, password, delay: 0 })
  bot.emit('messagestr', prompt)
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.deepEqual(bot.commands, [expected], `${plugin} prompt compatibility failed`)
  bot.emit('end')
}

const nLoginDialogBot = new MockBot('configuration')
autoAuth(nLoginDialogBot, { enabled: true, password, delay: 0 })
nLoginDialogBot._client.emit('show_dialog', {
  dialog: {
    title: 'nLogin',
    inputs: [{ key: 'password' }],
    action: 'nlogin:login/yes'
  }
})
assert.equal(nLoginDialogBot._client.rawPackets.length, 1)
assert.ok(nLoginDialogBot._client.rawPackets[0].includes(Buffer.from('nlogin:login/yes')))
assert.ok(nLoginDialogBot._client.rawPackets[0].includes(Buffer.from(password)))
nLoginDialogBot.emit('end')

console.log(
  `PASS auth compatibility matrix: ${cases.map(([name]) => name).join(', ')} + nLogin dialog`
)
