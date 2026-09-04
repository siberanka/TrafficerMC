import { SocksClient } from 'socks'
import { Socket } from 'net'

export function connection(
  proxyType,
  proxyHost,
  proxyPort,
  proxyUsername,
  proxyPassword,
  dHost,
  dPort
) {
  return new Promise((resolve, reject) => {
    const pType = (proxyType || '').toLowerCase()

    if (pType === 'socks5' || pType === 'socks4') {
      SocksClient.createConnection(
        {
          proxy: {
            host: proxyHost,
            port: parseInt(proxyPort),
            userId: proxyUsername,
            password: proxyPassword,
            type: pType === 'socks5' ? 5 : 4
          },
          command: 'connect',
          destination: {
            host: dHost,
            port: parseInt(dPort)
          }
        },
        (err, info) => {
          if (err) {
            return reject(err.message)
          }
          resolve(info.socket)
        }
      )
    } else if (pType === 'http' || pType === 'https') {
      const socket = new Socket()
      let connected = false
      const timeoutMs = 10000

      socket.setTimeout(timeoutMs, () => {
        socket.destroy()
        reject(new Error(`HTTP proxy connection timed out (${proxyHost}:${proxyPort})`))
      })

      socket.connect(parseInt(proxyPort), proxyHost, () => {
        let authHeader = ''
        if (proxyUsername) {
          const creds = Buffer.from(`${proxyUsername}:${proxyPassword || ''}`).toString('base64')
          authHeader = `Proxy-Authorization: Basic ${creds}\r\n`
        }
        const connectReq =
          `CONNECT ${dHost}:${dPort} HTTP/1.1\r\n` +
          `Host: ${dHost}:${dPort}\r\n` +
          authHeader +
          `Proxy-Connection: Keep-Alive\r\n\r\n`
        socket.write(connectReq)
      })

      const chunks = []
      let totalBytes = 0
      const onData = (chunk) => {
        chunks.push(chunk)
        totalBytes += chunk.length
        const fullBuf = Buffer.concat(chunks, totalBytes)
        const headerEndIndex = fullBuf.indexOf(Buffer.from('\r\n\r\n'))
        if (headerEndIndex !== -1) {
          socket.removeListener('data', onData)
          socket.setTimeout(0)
          const headerString = fullBuf.subarray(0, headerEndIndex).toString('latin1')
          const [statusLine] = headerString.split('\r\n')
          if (/^HTTP\/1\.[01]\s+200/i.test(statusLine)) {
            connected = true
            const rest = fullBuf.subarray(headerEndIndex + 4)
            if (rest.length > 0) {
              socket.unshift(rest)
            }
            resolve(socket)
          } else {
            socket.destroy()
            reject(new Error(`HTTP proxy rejected tunnel: ${statusLine}`))
          }
        }
      }

      socket.on('data', onData)
      socket.on('error', (err) => {
        if (!connected) reject(err.message || err)
      })
      socket.on('close', () => {
        if (!connected)
          reject(new Error('HTTP proxy closed connection before tunnel establishment'))
      })
    } else {
      const socket = new Socket().connect({
        host: dHost,
        port: parseInt(dPort)
      })
      socket.on('connect', () => {
        resolve(socket)
      })
      socket.on('error', (err) => {
        return reject(err.message)
      })
    }
  })
}
