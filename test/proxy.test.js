import assert from 'assert'
import http from 'http'
import net from 'net'
import { parseProxiesFromRaw, scrapeProxy } from '../src/main/js/proxy/proxyscrape.js'
import { connection } from '../src/main/js/proxy/proxyhandler.js'

console.log('--- Testing Proxy Scraper & HTTP Tunnel Mechanics ---')

// 1. Test Proxy Parser from Raw Text
{
  const rawText = `
    1.1.1.1:8080
    8.8.8.8:3128
    1.1.1.1:8080
    invalid.ip:80
    999.999.1.1:80
    127.0.0.1:1080
    192.168.1.100:80000
    203.0.113.195:1080
  `
  const parsed = parseProxiesFromRaw(rawText)
  assert.strictEqual(parsed.has('1.1.1.1:8080'), true)
  assert.strictEqual(parsed.has('8.8.8.8:3128'), true)
  assert.strictEqual(parsed.has('203.0.113.195:1080'), true)
  assert.strictEqual(parsed.has('127.0.0.1:1080'), false, 'Loopback should be filtered')
  assert.strictEqual(parsed.has('invalid.ip:80'), false, 'Invalid IP should be filtered')
  assert.strictEqual(parsed.has('999.999.1.1:80'), false, 'Invalid octet should be filtered')
  assert.strictEqual(parsed.has('192.168.1.100:80000'), false, 'Port > 65535 should be filtered')
  assert.strictEqual(parsed.size, 3, 'Duplicates and invalid entries should be stripped')
  console.log('✓ parseProxiesFromRaw (Text) passed')
}

// 2. Test Proxy Parser from JSON format
{
  const jsonData = JSON.stringify({
    data: [
      { ip: '198.51.100.1', port: 8080, protocols: ['http'] },
      { ip: '198.51.100.2', port: 1080, protocols: ['socks5'] },
      { ip: '127.0.0.1', port: 1080 },
      { ip: 'invalid', port: 80 }
    ]
  })
  const parsed = parseProxiesFromRaw(jsonData)
  assert.strictEqual(parsed.has('198.51.100.1:8080'), true)
  assert.strictEqual(parsed.has('198.51.100.2:1080'), true)
  assert.strictEqual(parsed.size, 2)
  console.log('✓ parseProxiesFromRaw (JSON) passed')
}

// 3. Test HTTP CONNECT Tunnel in proxyhandler.js
{
  const PROXY_PORT = 19188
  const DEST_PORT = 19189

  const mockDestServer = net.createServer((socket) => {
    socket.on('data', (data) => {
      if (data.toString() === 'HELLO_DEST') {
        socket.write('DEST_RESPONSE_OK')
      }
    })
  })

  const mockHttpProxy = http.createServer()
  mockHttpProxy.on('connect', (req, clientSocket, head) => {
    const [host, port] = req.url.split(':')
    const destSocket = net.connect(parseInt(port), host, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      destSocket.write(head)
      destSocket.pipe(clientSocket)
      clientSocket.pipe(destSocket)
    })
    destSocket.on('error', () => clientSocket.destroy())
    clientSocket.on('error', () => destSocket.destroy())
  })

  mockDestServer.listen(DEST_PORT, '127.0.0.1', () => {
    mockHttpProxy.listen(PROXY_PORT, '127.0.0.1', async () => {
      try {
        const tunnelSocket = await connection(
          'http',
          '127.0.0.1',
          PROXY_PORT,
          null,
          null,
          '127.0.0.1',
          DEST_PORT
        )

        tunnelSocket.write('HELLO_DEST')
        tunnelSocket.once('data', (chunk) => {
          assert.strictEqual(chunk.toString(), 'DEST_RESPONSE_OK')
          console.log('✓ HTTP CONNECT tunnel communication verified')
          tunnelSocket.destroy()
          mockHttpProxy.close()
          mockDestServer.close()
        })
      } catch (err) {
        mockHttpProxy.close()
        mockDestServer.close()
        assert.fail(`HTTP CONNECT tunnel failed: ${err.message}`)
      }
    })
  })
}

// 4. Test Live Web Scraper
{
  console.log('Testing live scrapeProxy for socks5 and http...')
  const [socks5Result, httpResult] = await Promise.all([scrapeProxy('socks5'), scrapeProxy('http')])

  const socks5Count = socks5Result ? socks5Result.trim().split(/\r?\n/).filter(Boolean).length : 0
  const httpCount = httpResult ? httpResult.trim().split(/\r?\n/).filter(Boolean).length : 0

  assert.ok(socks5Count > 50, `Expected at least 50 SOCKS5 proxies, got ${socks5Count}`)
  assert.ok(httpCount > 50, `Expected at least 50 HTTP proxies, got ${httpCount}`)

  console.log(
    `✓ Live scrapeProxy verified: ${socks5Count} SOCKS5 proxies, ${httpCount} HTTP proxies downloaded`
  )
  process.exit(0)
}
