import mc from 'minecraft-protocol'
import { connection } from './proxyhandler.js'
import { salt } from '../misc/utils.js'

export function checkProxy(
  proxyType,
  proxyHost,
  proxyPort,
  proxyUsername,
  proxyPassword,
  dHost,
  dPort,
  timeout
) {
  return new Promise((resolve, reject) => {
    const bot = mc.createClient({
      host: dHost,
      port: parseInt(dPort),
      username: salt(10),
      auth: 'offline',
      connect: async (client) => {
        try {
          const socket = await connection(
            proxyType,
            proxyHost,
            proxyPort,
            proxyUsername,
            proxyPassword,
            dHost,
            dPort
          )
          client.setSocket(socket)
          client.emit('connect')
        } catch (error) {
          const info = {
            reason: 'bad',
            error: error,
            proxy: proxyHost + ':' + proxyPort
          }
          return reject(info)
        }
      }
    })

    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try {
        bot.end()
      } catch (_) {}
      const info = {
        reason: 'timeout',
        proxy: proxyHost + ':' + proxyPort
      }
      return reject(info)
    }, timeout)

    bot.on('connect', () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        bot.end()
      } catch (_) {}
      const info = {
        reason: 'success',
        proxy: `${proxyHost}:${proxyPort}${proxyUsername ? `:${proxyUsername}` : ''}${proxyPassword ? `:${proxyPassword}` : ''}`
      }
      return resolve(info)
    })

    bot.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        bot.end()
      } catch (_) {}
      const info = {
        reason: 'bad',
        error: error.message || String(error),
        proxy: proxyHost + ':' + proxyPort
      }
      return reject(info)
    })
  })
}
