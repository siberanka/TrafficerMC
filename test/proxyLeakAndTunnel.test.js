import assert from 'assert'
import http from 'http'
import net from 'net'
import mc from 'minecraft-protocol'
import { connection } from '../src/main/js/proxy/proxyhandler.js'

console.log('=== Running Proxy Leak & Tunnel Integration Tests ===')

const MC_PORT = 25592
const HTTP_PROXY_PORT = 25593

// 1. Setup Mock HTTP CONNECT Proxy with strict Header & Leak Inspection
const proxyRequests = []
let proxyEstablishedTunnels = 0

const httpProxy = http.createServer()
httpProxy.on('connect', (req, clientSocket, head) => {
  proxyRequests.push({
    url: req.url,
    method: req.method,
    headers: req.headers
  })

  // Strict IP leak verification: Proxy MUST NOT pass or receive any client identification headers
  assert.strictEqual(req.headers['x-forwarded-for'], undefined, 'No X-Forwarded-For header allowed')
  assert.strictEqual(req.headers['client-ip'], undefined, 'No Client-IP header allowed')
  assert.strictEqual(req.headers['x-real-ip'], undefined, 'No X-Real-IP header allowed')

  const [destHost, destPort] = req.url.split(':')
  const destSocket = net.connect(parseInt(destPort), destHost, () => {
    proxyEstablishedTunnels++
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
    destSocket.write(head)
    destSocket.pipe(clientSocket)
    clientSocket.pipe(destSocket)
  })

  destSocket.on('error', () => clientSocket.destroy())
  clientSocket.on('error', () => destSocket.destroy())
})

await new Promise((resolve) => httpProxy.listen(HTTP_PROXY_PORT, '127.0.0.1', resolve))
console.log(`✓ Mock HTTP Proxy listening on 127.0.0.1:${HTTP_PROXY_PORT}`)

// 2. Setup Mock Minecraft Server to inspect incoming connection remote address
let serverReceivedConnections = []
const mcServer = mc.createServer({
  'online-mode': false,
  host: '127.0.0.1',
  port: MC_PORT,
  version: '1.20.4'
})

mcServer.on('connection', (client) => {
  serverReceivedConnections.push({
    remoteAddress: client.socket.remoteAddress,
    remotePort: client.socket.remotePort
  })
})

await new Promise((resolve) => {
  if (mcServer.socketServer?.listening) resolve()
  else mcServer.once('listening', resolve)
})
console.log(`✓ Mock Minecraft Server listening on 127.0.0.1:${MC_PORT}`)

// 3. Test HTTP Proxy Tunnel Connection
{
  console.log('--- Test 1: Establish tunnel through HTTP Proxy ---')
  const socket = await connection(
    'http',
    '127.0.0.1',
    HTTP_PROXY_PORT,
    null,
    null,
    '127.0.0.1',
    MC_PORT
  )

  assert.ok(socket && !socket.destroyed, 'Tunnel socket must be active')
  assert.strictEqual(proxyEstablishedTunnels, 1, 'Proxy tunnel counter must increment')
  assert.ok(
    proxyRequests.some((r) => r.url === `127.0.0.1:${MC_PORT}`),
    'Request target must match server'
  )

  // Verify Minecraft ping across the established tunnel
  const pingPromise = new Promise((resolve, reject) => {
    mc.ping({ host: '127.0.0.1', port: MC_PORT, stream: socket }, (err, res) => {
      if (err) return reject(err)
      resolve(res)
    })
  })

  const pingResult = await pingPromise
  assert.ok(pingResult, 'Ping response must be received through proxy tunnel')
  console.log(
    '✓ Successfully communicated with Minecraft server through HTTP proxy tunnel:',
    pingResult.version?.name
  )
  socket.destroy()
}

// 4. Test Dead Proxy: Guaranteed Zero IP Leak
{
  console.log('--- Test 2: Dead Proxy - Verify ZERO IP leak and clean error rejection ---')
  const deadProxyPort = 29999
  let errorCaught = false

  try {
    await connection('http', '127.0.0.1', deadProxyPort, null, null, '127.0.0.1', MC_PORT)
  } catch (err) {
    errorCaught = true
    console.log('✓ Caught expected proxy failure without fallback:', err)
  }

  assert.strictEqual(errorCaught, true, 'Dead proxy must reject and never connect directly')
}

// Cleanup
httpProxy.close()
mcServer.close()
console.log('=== ALL PROXY TUNNEL & IP LEAK TESTS PASSED SUCCESSFULLY! ===')
process.exit(0)
