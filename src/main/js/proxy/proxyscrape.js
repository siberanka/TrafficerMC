/**
 * Validates whether a string is a valid IPv4 address.
 */
function isValidIpv4(ip) {
  if (!ip) return false
  const parts = ip.split('.')
  if (parts.length !== 4) return false
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return false
    const num = parseInt(part, 10)
    if (num < 0 || num > 255) return false
  }
  // Exclude 0.0.0.0 and 127.0.0.1
  if (parts[0] === '0' || parts[0] === '127') return false
  return true
}

/**
 * Validates whether a port number is valid (1 - 65535).
 */
function isValidPort(port) {
  const p = parseInt(port, 10)
  return !isNaN(p) && p >= 1 && p <= 65535
}

/**
 * Extracts and normalizes IP:Port combinations from text, JSON, or arrays.
 */
export function parseProxiesFromRaw(rawContent) {
  const proxies = new Set()
  if (!rawContent) return proxies

  // 1. Try parsing JSON (e.g. Geonode, ProxyScrape API JSON)
  if (typeof rawContent === 'object' || (typeof rawContent === 'string' && (rawContent.trim().startsWith('{') || rawContent.trim().startsWith('[')))) {
    try {
      const data = typeof rawContent === 'object' ? rawContent : JSON.parse(rawContent)
      const list = Array.isArray(data) ? data : data.data || data.proxies || []
      if (Array.isArray(list)) {
        for (const item of list) {
          const ip = item.ip || item.ipAddress || item.host
          const port = item.port
          if (ip && port && isValidIpv4(ip) && isValidPort(port)) {
            proxies.add(`${ip}:${port}`)
          }
        }
      }
    } catch {
      // Fall through to regex parsing
    }
  }

  // 2. Regex-based IP:Port extraction from raw text
  const text = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent)
  const regex = /\b((?:\d{1,3}\.){3}\d{1,3}):(\d{2,5})\b/g
  let match
  while ((match = regex.exec(text)) !== null) {
    const ip = match[1]
    const port = match[2]
    if (isValidIpv4(ip) && isValidPort(port)) {
      proxies.add(`${ip}:${port}`)
    }
  }

  return proxies
}

/**
 * Fetches data from an endpoint with a timeout.
 */
async function fetchEndpoint(url, timeoutMs = 8000) {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TrafficerMC/3.3.0'
      }
    })
    clearTimeout(timer)
    if (!res.ok) return ''
    return await res.text()
  } catch {
    return ''
  }
}

/**
 * Returns proxy sources for the requested protocol.
 */
function getSourcesForProtocol(protocol) {
  const p = (protocol || 'socks5').toLowerCase()

  if (p === 'socks5') {
    return [
      'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5&timeout=10000&country=all&ssl=all&anonymity=all',
      'https://api.proxyscrape.com/v3/free-proxy-list/get?request=displayproxies&protocol=socks5&proxy_format=ipport&format=text',
      'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt',
      'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt',
      'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies_anonymous/socks5.txt',
      'https://raw.githubusercontent.com/hookzof/socks5_list/master/proxy.txt',
      'https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS5_RAW.txt',
      'https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/socks5/data.txt',
      'https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-socks5.txt',
      'https://raw.githubusercontent.com/zloi-user/hideip.me/main/socks5.txt',
      'https://proxylist.geonode.com/api/proxy-list?limit=500&page=1&sort_by=lastChecked&sort_type=desc&protocols=socks5'
    ]
  }

  if (p === 'socks4') {
    return [
      'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks4&timeout=10000&country=all&ssl=all&anonymity=all',
      'https://api.proxyscrape.com/v3/free-proxy-list/get?request=displayproxies&protocol=socks4&proxy_format=ipport&format=text',
      'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks4.txt',
      'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks4.txt',
      'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies_anonymous/socks4.txt',
      'https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS4_RAW.txt',
      'https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/socks4/data.txt',
      'https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-socks4.txt',
      'https://raw.githubusercontent.com/zloi-user/hideip.me/main/socks4.txt',
      'https://proxylist.geonode.com/api/proxy-list?limit=500&page=1&sort_by=lastChecked&sort_type=desc&protocols=socks4'
    ]
  }

  if (p === 'http' || p === 'https') {
    return [
      'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all',
      'https://api.proxyscrape.com/v3/free-proxy-list/get?request=displayproxies&protocol=http&proxy_format=ipport&format=text',
      'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
      'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt',
      'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies_anonymous/http.txt',
      'https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt',
      'https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/http/data.txt',
      'https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt',
      'https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-http.txt',
      'https://raw.githubusercontent.com/zloi-user/hideip.me/main/http.txt',
      'https://proxylist.geonode.com/api/proxy-list?limit=500&page=1&sort_by=lastChecked&sort_type=desc&protocols=http,https'
    ]
  }

  return []
}

/**
 * Scrapes live proxies from multiple reputable providers and GitHub repositories.
 * Returns a deduplicated newline-separated string of IP:Port proxies.
 */
export async function scrapeProxy(proxyType) {
  const targetType = proxyType && proxyType !== 'none' ? proxyType : 'socks5'
  const sources = getSourcesForProtocol(targetType)

  if (sources.length === 0) {
    return ''
  }

  const results = await Promise.allSettled(sources.map((url) => fetchEndpoint(url)))
  const allProxies = new Set()

  for (const res of results) {
    if (res.status === 'fulfilled' && res.value) {
      const parsed = parseProxiesFromRaw(res.value)
      for (const p of parsed) {
        allProxies.add(p)
      }
    }
  }

  return Array.from(allProxies).join('\n')
}
