import { AirStrings } from '@airstrings/web'
import { DEMO_PROJECT_ID, DEMO_BASE_URL, DEMO_LOCALES } from './demo-config'
import { PUBLIC_KEYS } from './demo-config.generated'

// ── String keys used in the demo ────────────────────────
const PLAIN_KEYS = [
  'greeting',
  'farewell',
  'app.title',
  'settings.theme',
  'settings.language',
  'onboarding.welcome',
]

const ICU_KEY = 'items.count'

const MISSING_KEYS = [
  'nonexistent.key',
  'undefined.feature',
]

// ── Initialize SDK ──────────────────────────────────────
const airstrings = new AirStrings({
  projectId: DEMO_PROJECT_ID,
  publicKeys: PUBLIC_KEYS,
  locale: 'en',
  baseURL: DEMO_BASE_URL,
  logger: (level, message, context) => {
    const prefix = `[AirStrings:${level}]`
    if (context) {
      console.log(prefix, message, context)
    } else {
      console.log(prefix, message)
    }
  },
})

// ── Event Log ───────────────────────────────────────────
const eventLog: { time: string; type: string; detail: string; isError: boolean }[] = []

function logTime(): string {
  return new Date().toLocaleTimeString('en-US', { hour12: false })
}

airstrings.on('strings:updated', (data) => {
  eventLog.push({
    time: logTime(),
    type: 'strings:updated',
    detail: `locale=${data.locale} rev=${data.revision}`,
    isError: false,
  })
  renderAll()
})

airstrings.on('strings:error', (data) => {
  eventLog.push({
    time: logTime(),
    type: 'strings:error',
    detail: `${data.error.code}: ${data.error.message}`,
    isError: true,
  })
  renderAll()
})

// ── ICU demo state ──────────────────────────────────────
let icuCount = 5
let icuStatus = 'active'

// ── Render functions ────────────────────────────────────
function renderStatus(): void {
  const grid = document.getElementById('status-grid')!
  const readyClass = airstrings.isReady ? 'ready' : 'not-ready'
  const readyText = airstrings.isReady ? 'Ready' : 'Loading...'

  grid.innerHTML = `
    <div class="status-item">
      <div class="status-label">Status</div>
      <div class="status-value ${readyClass}">${readyText}</div>
    </div>
    <div class="status-item">
      <div class="status-label">Locale</div>
      <div class="status-value">${airstrings.locale}</div>
    </div>
    <div class="status-item">
      <div class="status-label">Revision</div>
      <div class="status-value">${airstrings.revision}</div>
    </div>
    <div class="status-item">
      <div class="status-label">String Count</div>
      <div class="status-value">${Object.keys(airstrings.strings).length}</div>
    </div>
    <div class="status-item">
      <div class="status-label">Project ID</div>
      <div class="status-value">${DEMO_PROJECT_ID}</div>
    </div>
    <div class="status-item">
      <div class="status-label">Base URL</div>
      <div class="status-value" style="font-size:11px;word-break:break-all">${DEMO_BASE_URL}</div>
    </div>
  `
}

function renderStrings(): void {
  const container = document.getElementById('strings-list')!
  container.innerHTML = PLAIN_KEYS.map((key) => {
    const value = airstrings.t(key)
    const isFallback = value === key
    const valueClass = isFallback ? 'string-value fallback' : 'string-value'
    return `
      <div class="string-row">
        <span class="string-key">${key}</span>
        <span class="${valueClass}">${escapeHtml(value)}<span class="format-badge text">text</span></span>
      </div>
    `
  }).join('')
}

function renderICU(): void {
  const section = document.getElementById('icu-section')!

  const pluralResult = airstrings.format(ICU_KEY, { count: icuCount })
  const rawPattern = airstrings.t(ICU_KEY)
  const selectResult = airstrings.format('status.label', { status: icuStatus })

  section.innerHTML = `
    <div class="string-row">
      <span class="string-key">${ICU_KEY}</span>
      <span class="string-value" style="font-size:12px;word-break:break-all">${escapeHtml(rawPattern)}<span class="format-badge icu">icu</span></span>
    </div>
    <div class="icu-args-row">
      <label>count =</label>
      <input type="number" id="icu-count" value="${icuCount}" min="0" max="9999" />
      <span style="margin-left: auto; font-size: 15px; font-weight: 500">${escapeHtml(pluralResult)}</span>
    </div>
    <div class="icu-demo">
      <div class="icu-demo-label">Preset values</div>
    </div>
    <div class="icu-demo">
      <div class="icu-demo-label">count = 0</div>
      <div class="icu-demo-result">${escapeHtml(airstrings.format(ICU_KEY, { count: 0 }))}</div>
    </div>
    <div class="icu-demo">
      <div class="icu-demo-label">count = 1</div>
      <div class="icu-demo-result">${escapeHtml(airstrings.format(ICU_KEY, { count: 1 }))}</div>
    </div>
    <div class="icu-demo">
      <div class="icu-demo-label">count = 42</div>
      <div class="icu-demo-result">${escapeHtml(airstrings.format(ICU_KEY, { count: 42 }))}</div>
    </div>
  `

  document.getElementById('icu-count')?.addEventListener('input', (e) => {
    icuCount = parseInt((e.target as HTMLInputElement).value, 10) || 0
    renderICU()
  })
}

function renderFallback(): void {
  const section = document.getElementById('fallback-section')!
  section.innerHTML = MISSING_KEYS.map((key) => {
    const value = airstrings.t(key)
    return `
      <div class="string-row">
        <span class="string-key">${key}</span>
        <span class="string-value fallback">${escapeHtml(value)}</span>
      </div>
    `
  }).join('') + `
    <div class="icu-demo">
      <div class="icu-demo-label">format('nonexistent.key', { count: 1 })</div>
      <div class="icu-demo-result" style="color: var(--orange); font-style: italic">${escapeHtml(airstrings.format('nonexistent.key', { count: 1 }))}</div>
    </div>
  `
}

function renderEventLog(): void {
  const container = document.getElementById('event-log')!
  if (eventLog.length === 0) {
    container.innerHTML = '<div class="empty-state">No events yet</div>'
    return
  }
  container.innerHTML = [...eventLog].reverse().map((entry) => `
    <div class="event-entry">
      <span class="event-time">${entry.time}</span>
      <span class="event-type${entry.isError ? ' error' : ''}">${entry.type}</span>
      <span class="event-detail">${escapeHtml(entry.detail)}</span>
    </div>
  `).join('')
}

function renderLocaleSwitcher(): void {
  const container = document.getElementById('locale-switcher')!
  container.innerHTML = DEMO_LOCALES.map((loc) => {
    const active = loc === airstrings.locale ? ' active' : ''
    return `<button data-locale="${loc}" class="${active}">${loc.toUpperCase()}</button>`
  }).join('')

  container.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const locale = btn.getAttribute('data-locale')!
      if (locale === airstrings.locale) return
      await airstrings.setLocale(locale)
      renderAll()
    })
  })
}

function renderAll(): void {
  renderStatus()
  renderStrings()
  renderICU()
  renderFallback()
  renderEventLog()
  renderLocaleSwitcher()
}

function escapeHtml(s: string): string {
  const div = document.createElement('div')
  div.textContent = s
  return div.innerHTML
}

// ── Refresh button ──────────────────────────────────────
document.getElementById('refresh-btn')!.addEventListener('click', async () => {
  await airstrings.refresh()
  renderAll()
})

// ── Initial render + poll until ready ───────────────────
renderAll()

const readyPoll = setInterval(() => {
  if (airstrings.isReady) {
    clearInterval(readyPoll)
  }
  renderAll()
}, 200)

// Stop polling after 10 seconds regardless
setTimeout(() => clearInterval(readyPoll), 10000)
