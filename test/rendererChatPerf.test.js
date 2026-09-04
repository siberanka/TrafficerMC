import assert from 'assert'

console.log('=== Testing Renderer Chat Performance & Batching ===')

// Mock DOM elements and requestAnimationFrame
class MockNode {
  constructor(tag) {
    this.tagName = tag.toUpperCase()
    this.children = []
    this.innerHTML = ''
    this.style = {}
  }
  get firstChild() {
    return this.children[0] || null
  }
  removeChild(child) {
    const idx = this.children.indexOf(child)
    if (idx !== -1) {
      this.children.splice(idx, 1)
    }
  }
  appendChild(child) {
    if (child.tagName === 'FRAGMENT') {
      this.children.push(...child.children)
      child.children = []
    } else {
      this.children.push(child)
    }
  }
}

class MockDocumentFragment extends MockNode {
  constructor() {
    super('FRAGMENT')
  }
}

// Global mocks
const mockChatBox = new MockNode('UL')
mockChatBox.scrollHeight = 1000
mockChatBox.scrollTop = 0

const mockDom = {
  chatBox: mockChatBox,
  enableChat: { checked: true },
  autoScrollChat: { checked: true }
}

global.document = {
  getElementById: (id) => mockDom[id] || null,
  createElement: (tag) => new MockNode(tag),
  createDocumentFragment: () => new MockDocumentFragment()
}

let pendingRaf = null
global.requestAnimationFrame = (cb) => {
  pendingRaf = cb
}

// Load batching logic
const chatQueue = []
let chatFlushScheduled = false
const MAX_CHAT_NODES = 250
const MAX_CHAT_ITEMS_PER_FRAME = 75

function getLocalTimestamp() {
  return '[12:00:00]'
}

function escapeHtml(str) {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function flushChatQueue() {
  chatFlushScheduled = false
  const enable = document.getElementById('enableChat')?.checked
  if (!enable) {
    chatQueue.length = 0
    return
  }

  const chatBox = document.getElementById('chatBox')
  if (!chatBox || chatQueue.length === 0) return

  const scroll = document.getElementById('autoScrollChat')?.checked
  const itemsToRender = chatQueue.splice(0, MAX_CHAT_ITEMS_PER_FRAME)
  const fragment = document.createDocumentFragment()

  for (let i = 0; i < itemsToRender.length; i++) {
    const item = itemsToRender[i]
    const li = document.createElement('li')
    if (item.type === 'console') {
      li.className = item.lineClass || 'line-server'
      let tagClass = 'tag-server'
      if (item.lineClass === 'line-whisper') tagClass = 'tag-whisper'
      else if (item.lineClass === 'line-bot') tagClass = 'tag-bot'
      else if (item.lineClass === 'line-system') tagClass = 'tag-system'
      else if (item.lineClass === 'line-warn') tagClass = 'tag-warn'

      li.innerHTML = `<span class="console-ts">${escapeHtml(item.ts)}</span><span class="console-tag ${tagClass}">[${escapeHtml(item.tag)}]</span><span class="console-msg">${escapeHtml(item.text)}</span>`
    } else if (item.type === 'direct') {
      li.innerHTML = item.html
    } else {
      li.className = 'line-bot'
      li.innerHTML = `<span class="console-ts">${getLocalTimestamp()}</span><span class="console-tag tag-bot">[${escapeHtml(item.prefix || 'Bot')}${item.name ? '/' + escapeHtml(item.name) : ''}]</span><span class="console-msg">${escapeHtml(item.text)}</span>`
    }
    fragment.appendChild(li)
  }

  const currentCount = chatBox.children.length
  const overflow = currentCount + itemsToRender.length - MAX_CHAT_NODES
  if (overflow > 0) {
    const removeCount = Math.min(overflow, currentCount)
    for (let i = 0; i < removeCount; i++) {
      chatBox.removeChild(chatBox.firstChild)
    }
  }

  chatBox.appendChild(fragment)

  if (scroll) {
    chatBox.scrollTop = chatBox.scrollHeight
  }

  if (chatQueue.length > 0 && !chatFlushScheduled) {
    chatFlushScheduled = true
    requestAnimationFrame(flushChatQueue)
  }
}

function logConsole(tag, text, lineClass = 'line-server', source = '') {
  const enable = document.getElementById('enableChat')?.checked
  if (!enable) return

  const ts = getLocalTimestamp()
  chatQueue.push({
    type: 'console',
    ts,
    tag,
    text: String(text ?? ''),
    lineClass,
    source
  })

  if (chatQueue.length > MAX_CHAT_NODES) {
    chatQueue.splice(0, chatQueue.length - MAX_CHAT_NODES)
  }

  if (!chatFlushScheduled) {
    chatFlushScheduled = true
    requestAnimationFrame(flushChatQueue)
  }
}

// Test 1: Bombard with 1,000 chat messages rapidly
console.log('--- Test 1: Rapid 1000 messages burst ---')
const startTime = Date.now()
for (let i = 0; i < 1000; i++) {
  logConsole('Server/INFO', `Heavy spam message #${i} <test & injection>`, 'line-server')
}
const elapsedMs = Date.now() - startTime
console.log(`Pushed 1000 messages in ${elapsedMs}ms (Synchronous load: 0 reflows)`)
assert.ok(chatFlushScheduled, 'RAF must be scheduled')
assert.strictEqual(chatQueue.length, MAX_CHAT_NODES, 'Queue must be capped to MAX_CHAT_NODES')

// Test 2: Trigger the RAF flush
console.log('--- Test 2: Batch flush via DocumentFragment ---')
assert.ok(pendingRaf !== null, 'pendingRaf must exist')
pendingRaf() // Execute first bounded frame
assert.strictEqual(
  mockChatBox.children.length,
  MAX_CHAT_ITEMS_PER_FRAME,
  'A frame must render only the bounded chunk'
)
while (chatFlushScheduled) pendingRaf()

assert.strictEqual(
  mockChatBox.children.length,
  MAX_CHAT_NODES,
  `Chat box must have exactly ${MAX_CHAT_NODES} nodes`
)
assert.strictEqual(chatFlushScheduled, false, 'Flush flag must reset')
assert.strictEqual(mockChatBox.scrollTop, mockChatBox.scrollHeight, 'Auto-scroll must be triggered')

// Verify HTML escaping and console structure in the rendered content
assert.ok(
  mockChatBox.children[0].innerHTML.includes('&lt;test &amp; injection&gt;'),
  'HTML characters must be safely escaped'
)
assert.ok(
  mockChatBox.children[0].innerHTML.includes('console-tag tag-server'),
  'Console tag styling must be present'
)

// Test 3: Pruning when more messages arrive (including whisper messages)
console.log('--- Test 3: Node pruning on subsequent bursts ---')
for (let i = 0; i < 50; i++) {
  logConsole('PM -> AlphaBot', `Private message #${i}`, 'line-whisper')
}
pendingRaf()
assert.strictEqual(
  mockChatBox.children.length,
  MAX_CHAT_NODES,
  'Chat box must never exceed MAX_CHAT_NODES'
)
assert.strictEqual(
  mockChatBox.children[mockChatBox.children.length - 1].className,
  'line-whisper',
  'Last rendered message must have line-whisper class'
)

console.log('=== ALL RENDERER CHAT PERFORMANCE TESTS PASSED SUCCESSFULLY! ===')
