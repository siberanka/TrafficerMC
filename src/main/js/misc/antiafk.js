async function rotate(bot) {
  let yaw = 2 * Math.random() * Math.PI - 0.5 * Math.PI
  let pitch = Math.random() * Math.PI - 0.5 * Math.PI
  await bot.look(yaw, pitch, false)
}

function jump(bot) {
  return new Promise((resolve) => {
    bot.setControlState('jump', true)
    if (!bot.entity.isInWater) bot.setControlState('jump', false)
    setTimeout(resolve, 1000)
  })
}
async function swingArm(bot) {
  let arm = Math.random() < 0.5 ? 'right' : 'left'
  await bot.swingArm(arm)
}
function delayMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function start(bot) {
  if (bot.afk.stopping) {
    bot.afk.stopped = true
    return
  }
  if (bot._client.state != 'play') {
    bot.once('spawn', () => start(bot))
    return
  }
  if (bot.entity.isInWater) bot.setControlState('jump', true)
  try {
    const action = bot.afk.config.actions[Math.floor(Math.random() * bot.afk.config.actions.length)]
    if (typeof bot.afk[action] === 'function') {
      await bot.afk[action]()
    }
  } catch (_) {}

  // Pacing delay between actions (1000ms - 2500ms) to prevent CPU/event loop saturation
  await delayMs(Math.floor(Math.random() * 1500) + 1000)
  start(bot)
}

function setOptions(bot) {
  let config = bot.afk.config
  config.actions = ['rotate', 'jump', 'swingArm']
}

function stop(bot) {
  bot.afk.stopping = true
  return new Promise((resolve) => {
    if (!bot.afk.enabled) return resolve('nothing to stop')
    const timer = setInterval(() => {
      if (bot.afk.stopped) {
        clearInterval(timer)
        bot.afk.stopping = null
        bot.afk.stopped = null
        bot.afk.enabled = false
        resolve('stopped successfully')
      }
    }, 250)
  })
}

export function antiafk(bot) {
  bot.afk = {
    config: {},
    enabled: false,
    start: async () => {
      bot.afk.enabled = true
      await start(bot)
    },
    stop: async () => await stop(bot),
    setOptions: (opt) =>
      setOptions(bot, {
        ...opt
      }),
    rotate: async () => await rotate(bot),
    jump: async () => await jump(bot),
    swingArm: async () => await swingArm(bot)
  }
  bot.afk.setOptions()
}
