import assert from 'assert'
import http from 'http'
import net from 'net'
import mc from 'minecraft-protocol'
import { checkProxy } from '../src/main/js/proxy/proxycheck.js'
import { connection } from '../src/main/js/proxy/proxyhandler.js'
import { scrapeProxy, getSourcesForOptions } from '../src/main/js/proxy/proxyscrape.js'

console.log('--- Running Local Server & Advanced Proxy Tests ---')

// 1. Test URL generation based on source & anonymity options
{
  const proxyscrapeUrls = getSourcesForOptions({
    protocol: 'socks5',
    source: 'proxyscrape',
    anonymity: 'elite'
  })
  assert.strictEqual(proxyscrapeUrls.length, 2)
  assert.ok(proxyscrapeUrls[0].includes('anonymity=elite'))
  assert.ok(proxyscrapeUrls[0].includes('protocol=socks5'))
  console.log('✓ getSourcesForOptions (ProxyScrape with Elite anonymity) passed')

  const customUrls = getSourcesForOptions({
    protocol: 'http',
    source: 'custom',
    customUrls: 'https://example.com/proxies.txt\nhttps://test.com/socks.txt\ninvalid-url'
  })
  assert.strictEqual(customUrls.length, 2)
  assert.strictEqual(customUrls[0], 'https://example.com/proxies.txt')
  assert.strictEqual(customUrls[1], 'https://test.com/socks.txt')
  console.log('✓ getSourcesForOptions (Custom Raw URLs) passed')
}

// 2. Test custom URL scraping against a deterministic local feed.
{
  const feedPort = 25584
  const feed = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ data: [{ ip: '198.51.100.30', port: 8080 }] }))
  })
  await new Promise((resolve) => feed.listen(feedPort, '127.0.0.1', resolve))
  try {
    const customResult = await scrapeProxy({
      proxyType: 'http',
      proxySource: 'custom',
      customProxyUrls: `http://127.0.0.1:${feedPort}/proxies.json`
    })
    assert.strictEqual(customResult, '198.51.100.30:8080')
    console.log('✓ scrapeProxy local custom JSON source verified')
  } finally {
    await new Promise((resolve) => feed.close(resolve))
  }
}

// 3. Test Local Minecraft Server with HTTP CONNECT proxy
{
  const MC_PORT = 25585
  const PROXY_PORT = 25586

  console.log(`Starting local Minecraft test server on 127.0.0.1:${MC_PORT}...`)
  const mcServer = mc.createServer({
    'online-mode': false,
    host: '127.0.0.1',
    port: MC_PORT,
    version: '1.20.4'
  })

  // Register listening listener immediately
  const serverListeningPromise = new Promise((resolve) => {
    if (mcServer.socketServer?.listening) {
      resolve()
    } else {
      mcServer.once('listening', resolve)
    }
  })

  // Start mock HTTP CONNECT Proxy
  const httpProxy = http.createServer()
  httpProxy.on('connect', (req, clientSocket, head) => {
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

  await new Promise((resolve) => httpProxy.listen(PROXY_PORT, '127.0.0.1', resolve))
  console.log(`Local HTTP Proxy running on 127.0.0.1:${PROXY_PORT}`)

  await serverListeningPromise
  console.log('Local Minecraft server is listening!')

  // Step A: Test checkProxy through HTTP proxy to local Minecraft server
  try {
    console.log('Testing checkProxy through HTTP proxy to local Minecraft server...')
    const checkResult = await checkProxy(
      'http',
      '127.0.0.1',
      PROXY_PORT,
      null,
      null,
      '127.0.0.1',
      MC_PORT,
      6000
    )
    assert.strictEqual(checkResult.reason, 'success')
    console.log('✓ checkProxy through local HTTP proxy passed:', checkResult)
  } catch (err) {
    assert.fail(`checkProxy failed: ${JSON.stringify(err)}`)
  }

  // Step B: Test direct tunnel connection and packet ping through proxy
  const socket = await connection('http', '127.0.0.1', PROXY_PORT, null, null, '127.0.0.1', MC_PORT)
  assert.ok(socket && !socket.destroyed)
  console.log('✓ Direct connection socket established through HTTP proxy')
  socket.destroy()

  // Cleanup
  httpProxy.close()
  mcServer.close()
  console.log('✓ All local server and proxy integration tests passed successfully!')
  process.exit(0)
}
