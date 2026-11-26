import fs from 'node:fs'
import { ReactiveEngine } from '@pravosleva/reactive-engine'

const SVG_NS = ['http:/', '/www.w3.org', '/2000/svg'].join('')

const resultsDir = new URL('./results/', import.meta.url)
const jsonPath = new URL('./matrix-report.json', resultsDir)

if (!fs.existsSync(jsonPath)) {
  console.error('❌ Файл ./results/matrix-report.json не найден. Сначала запустите: node analyze.mjs')
  process.exit(1)
}

const rawData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))

const escapeXml = (str) =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

// Конфигурация цветов и подписей для 7 критериев
const CRITERIA_META = [
  { key: 'speed', label: 'Speed', short: 'Spd', color: '#38bdf8' },
  { key: 'smartGraph', label: 'SmartGraph', short: 'Grp', color: '#818cf8' },
  { key: 'nodeMem', label: 'NodeMem', short: 'Node', color: '#f43f5e' },
  { key: 'tickMem', label: 'TickMem', short: 'Tick', color: '#fb923c' },
  { key: 'leak', label: 'Leak', short: 'Leak', color: '#facc15' },
  { key: 'isolation', label: 'Isolation', short: 'Iso', color: '#2dd4bf' },
  { key: 'ergonomics', label: 'DX', short: 'DX', color: '#4ade80' },
]
const renderCriteriaLegend = (startX, y) => {
  let cursorX = startX
  return CRITERIA_META.map((item) => {
    const itemSvg = [
      `  <rect x="${cursorX}" y="${y - 8}" width="10" height="10" rx="2" fill="${item.color}" />`,
      `  <text x="${cursorX + 14}" y="${y}" fill="#c9d1d9" font-family="'DejaVu Sans Mono', monospace" font-size="10.5">${escapeXml(item.label)}</text>`,
    ].join('\n')
    cursorX += 14 + item.label.length * 6.5 + 14
    return itemSvg
  }).join('\n')
}

// Fallback-веса на случай, если matrix-report.json собран до добавления поля weights
const FALLBACK_WEIGHTS = {
  'gis-maps': {
    desktop: { speed: 0.25, smartGraph: 0.25, nodeMem: 0.05, tickMem: 0.20, leak: 0.15, isolation: 0.05, ergonomics: 0.05 },
    mobile: { speed: 0.15, smartGraph: 0.20, nodeMem: 0.20, tickMem: 0.25, leak: 0.15, isolation: 0.00, ergonomics: 0.05 },
  },
  'multi-step-forms': {
    desktop: { speed: 0.20, smartGraph: 0.30, nodeMem: 0.05, tickMem: 0.05, leak: 0.10, isolation: 0.10, ergonomics: 0.20 },
    mobile: { speed: 0.15, smartGraph: 0.25, nodeMem: 0.20, tickMem: 0.10, leak: 0.15, isolation: 0.05, ergonomics: 0.10 },
  },
  'mfe-cabinet': {
    desktop: { speed: 0.15, smartGraph: 0.15, nodeMem: 0.05, tickMem: 0.05, leak: 0.20, isolation: 0.25, ergonomics: 0.15 },
    mobile: { speed: 0.10, smartGraph: 0.10, nodeMem: 0.25, tickMem: 0.10, leak: 0.25, isolation: 0.15, ergonomics: 0.05 },
  },
  'ssr-apps': {
    desktop: { speed: 0.20, smartGraph: 0.15, nodeMem: 0.10, tickMem: 0.05, leak: 0.15, isolation: 0.25, ergonomics: 0.10 },
    mobile: { speed: 0.15, smartGraph: 0.10, nodeMem: 0.25, tickMem: 0.10, leak: 0.20, isolation: 0.15, ergonomics: 0.05 },
  },
  'realtime-telemetry': {
    desktop: { speed: 0.30, smartGraph: 0.15, nodeMem: 0.05, tickMem: 0.30, leak: 0.10, isolation: 0.05, ergonomics: 0.05 },
    mobile: { speed: 0.20, smartGraph: 0.10, nodeMem: 0.20, tickMem: 0.35, leak: 0.10, isolation: 0.00, ergonomics: 0.05 },
  },
  'massive-grid': {
    desktop: { speed: 0.25, smartGraph: 0.25, nodeMem: 0.25, tickMem: 0.10, leak: 0.05, isolation: 0.05, ergonomics: 0.05 },
    mobile: { speed: 0.15, smartGraph: 0.15, nodeMem: 0.45, tickMem: 0.15, leak: 0.05, isolation: 0.00, ergonomics: 0.05 },
  },
  'canvas-node-editor': {
    desktop: { speed: 0.25, smartGraph: 0.25, nodeMem: 0.05, tickMem: 0.30, leak: 0.05, isolation: 0.00, ergonomics: 0.10 },
    mobile: { speed: 0.15, smartGraph: 0.20, nodeMem: 0.20, tickMem: 0.35, leak: 0.05, isolation: 0.00, ergonomics: 0.05 },
  },
  'offline-local-first': {
    desktop: { speed: 0.20, smartGraph: 0.20, nodeMem: 0.05, tickMem: 0.10, leak: 0.25, isolation: 0.10, ergonomics: 0.10 },
    mobile: { speed: 0.10, smartGraph: 0.15, nodeMem: 0.25, tickMem: 0.15, leak: 0.25, isolation: 0.05, ergonomics: 0.05 },
  },
  'messenger-chat-rooms': {
    desktop: { speed: 0.15, smartGraph: 0.20, nodeMem: 0.20, tickMem: 0.10, leak: 0.20, isolation: 0.05, ergonomics: 0.10 },
    mobile: { speed: 0.10, smartGraph: 0.15, nodeMem: 0.30, tickMem: 0.15, leak: 0.20, isolation: 0.05, ergonomics: 0.05 },
  },
  'trading-charts-terminal': {
    desktop: { speed: 0.30, smartGraph: 0.20, nodeMem: 0.05, tickMem: 0.30, leak: 0.05, isolation: 0.00, ergonomics: 0.10 },
    mobile: { speed: 0.20, smartGraph: 0.15, nodeMem: 0.20, tickMem: 0.35, leak: 0.05, isolation: 0.00, ergonomics: 0.05 },
  },
}

// ============================================================================
// Реактивный граф расчёта геометрии и SVG-разметки на @pravosleva/reactive-engine
// ============================================================================
const engine = new ReactiveEngine()

const reportSig = engine.signal(rawData, 'svg:reportData')
const layoutConfigSig = engine.signal(
  {
    width: 640,
    padX: 20,
    headerHeight: 134,
    cardHeight: 304,
    cardGap: 16,
    footerHeight: 62,
  },
  'svg:layoutConfig'
)

const renderLaptopIcon = (x, y) => [
  `    <rect x="${x + 2}" y="${y - 9}" width="12" height="8" rx="1.5" fill="none" stroke="#3b82f6" stroke-width="1.4" />`,
  `    <line x1="${x}" y1="${y + 1}" x2="${x + 16}" y2="${y + 1}" stroke="#3b82f6" stroke-width="1.6" stroke-linecap="round" />`,
].join('\n')

const renderMobileIcon = (x, y) => [
  `    <rect x="${x + 3}" y="${y - 10}" width="9" height="13" rx="1.8" fill="none" stroke="#10b981" stroke-width="1.4" />`,
  `    <circle cx="${x + 7.5}" cy="${y + 0.8}" r="0.8" fill="#10b981" />`,
].join('\n')

// Разбиение длинного заголовка сценария на 2 строки для узкого мобильного экрана
const wrapTitle = (title, maxLen = 54) => {
  if (title.length <= maxLen) return [title]
  const splitIdx = title.lastIndexOf(' ', maxLen)
  if (splitIdx === -1) return [title]
  return [title.slice(0, splitIdx), title.slice(splitIdx + 1)]
}

// Рендер составной шкалы весов (Stacked Bar) + подписи топ-критериев
const renderWeightsStrip = (weightsObj, x, y, totalWidth) => {
  const active = CRITERIA_META
    .map((m) => ({ ...m, weight: Number(weightsObj?.[m.key] ?? 0) }))
    .filter((item) => item.weight > 0)

  let cursorX = x
  const barHeight = 7
  const segments = active.map((item, idx) => {
    const segW = idx === active.length - 1
      ? Math.max(2, x + totalWidth - cursorX)
      : Math.max(2, Math.round(item.weight * totalWidth))
    const rect = `    <rect x="${cursorX}" y="${y}" width="${segW}" height="${barHeight}" fill="${item.color}" />`
    cursorX += segW
    return rect
  })

  // Текстовая легенда критериев с весом >= 0% (отсортирована по убыванию важности)
  let labelX = x
  const badges = CRITERIA_META.map((item) => {
    const pct = Math.round(Number(weightsObj?.[item.key] ?? 0) * 100)
    const text = `${item.short} ${pct}%`
    const svg = [
      `    <rect x="${labelX}" y="${y + 11}" width="7" height="7" rx="1.5" fill="${item.color}" />`,
      `    <text x="${labelX + 10}" y="${y + 18}" fill="${pct === 0 ? '#484f58' : '#8b949e'}" font-family="'DejaVu Sans Mono', monospace" font-size="9.5">${text}</text>`,
    ].join('\n')
    labelX += 10 + text.length * 5.8 + 8
    return svg
  })

  return [...segments, ...badges].join('\n')
}

// Рендер вертикального Top-3 блока для одного профиля (Desktop или Mobile)
const renderProfileTop3 = (list, x, startY, width, accentColor) =>
  list
    .slice(0, 3)
    .map((item, idx) => {
      const y = startY + idx * 24
      const isFirst = idx === 0
      const rankColor = isFirst ? accentColor : '#8b949e'
      const textColor = isFirst ? '#f0f6fc' : '#c9d1d9'
      const weight = isFirst ? '700' : '500'
      const barMax = 128
      const barW = Math.max(8, Math.round((item.score / 100) * barMax))
      const barFill = isFirst ? accentColor : '#475569'
      const label = `${item.engine} ${item.version}`.trim()

      return [
        `    <text x="${x}" y="${y}" fill="${rankColor}" font-family="'DejaVu Sans Mono', monospace" font-size="12" font-weight="700">#${idx + 1}</text>`,
        `    <text x="${x + 26}" y="${y}" fill="${textColor}" font-family="'DejaVu Sans', sans-serif" font-size="12" font-weight="${weight}">${escapeXml(label)}</text>`,
        `    <rect x="${x + width - barMax - 54}" y="${y - 9}" width="${barMax}" height="9" rx="3" fill="#21262d" />`,
        `    <rect x="${x + width - barMax - 54}" y="${y - 9}" width="${barW}" height="9" rx="3" fill="${barFill}" />`,
        `    <text x="${x + width}" y="${y}" text-anchor="end" fill="${rankColor}" font-family="'DejaVu Sans Mono', monospace" font-size="12" font-weight="700">${item.score.toFixed(1)}</text>`,
      ].join('\n')
    })
    .join('\n')

// Вычисляемый узел итоговой геометрии и SVG-строки
const svgOutputComputed = engine.computed(() => {
  const data = reportSig.value
  const cfg = layoutConfigSig.value
  const scenarios = data.scenarios
  const innerWidth = cfg.width - cfg.padX * 2
  const contentX = cfg.padX + 14
  const contentWidth = innerWidth - 28

  const totalHeight =
    cfg.headerHeight + scenarios.length * (cfg.cardHeight + cfg.cardGap) + cfg.footerHeight

  const cardsSvg = scenarios
    .map((sc, idx) => {
      const cardY = cfg.headerHeight + idx * (cfg.cardHeight + cfg.cardGap)
      const weights = sc.weights ?? FALLBACK_WEIGHTS[sc.id] ?? {}
      const titleLines = wrapTitle(sc.title, 56)

      const titleSvg =
        titleLines.length === 1
          ? `    <text x="${contentX}" y="25" fill="#f0f6fc" font-family="'DejaVu Sans', sans-serif" font-size="13.5" font-weight="700">${escapeXml(titleLines[0])}</text>`
          : [
              `    <text x="${contentX}" y="22" fill="#f0f6fc" font-family="'DejaVu Sans', sans-serif" font-size="13" font-weight="700">${escapeXml(titleLines[0])}</text>`,
              `    <text x="${contentX}" y="38" fill="#f0f6fc" font-family="'DejaVu Sans', sans-serif" font-size="13" font-weight="700">${escapeXml(titleLines[1])}</text>`,
            ].join('\n')

      return [
        `  <g transform="translate(0, ${cardY})">`,
        `    <rect x="${cfg.padX}" y="0" width="${innerWidth}" height="${cfg.cardHeight}" rx="10" fill="#161b22" stroke="#30363d" stroke-width="1" />`,
        titleSvg,
        `    <line x1="${contentX}" y1="48" x2="${contentX + contentWidth}" y2="48" stroke="#21262d" stroke-width="1" />`,
        // Секция Desktop
        renderLaptopIcon(contentX, 65),
        `    <text x="${contentX + 22}" y="66" fill="#3b82f6" font-family="'DejaVu Sans Mono', monospace" font-size="11" font-weight="700">DESKTOP / LAPTOP</text>`,
        renderWeightsStrip(weights.desktop, contentX, 73, contentWidth),
        renderProfileTop3(sc.desktopTop5, contentX, 112, contentWidth, '#3b82f6'),
        // Разделитель профилей
        `    <line x1="${contentX}" y1="174" x2="${contentX + contentWidth}" y2="174" stroke="#21262d" stroke-width="1" stroke-dasharray="4 3" />`,
        // Секция Mobile
        renderMobileIcon(contentX, 191),
        `    <text x="${contentX + 22}" y="192" fill="#10b981" font-family="'DejaVu Sans Mono', monospace" font-size="11" font-weight="700">MOBILE / LOW-RAM</text>`,
        renderWeightsStrip(weights.mobile, contentX, 199, contentWidth),
        renderProfileTop3(sc.mobileTop5, contentX, 238, contentWidth, '#10b981'),
        `  </g>`,
      ].join('\n')
    })
    .join('\n')

  const subtitle = `Sources: mol-collider (${data.sources.colliderTimestamp.slice(0, 10)}) + reactive-memory (${data.sources.memoryTimestamp.slice(0, 10)})`
  const footerLine1 = `Generated: ${data.generatedAt}`
  const footerLine2 = `Score: 0..100 weighted index (Speed, SmartGraph, NodeMem, TickMem, Leak, Isolation, DX)`

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="${SVG_NS}" width="${cfg.width}" height="${totalHeight}" viewBox="0 0 ${cfg.width} ${totalHeight}">`,
    `  <rect width="100%" height="100%" rx="14" fill="#0d1117" stroke="#30363d" stroke-width="1.5" />`,
    `  <text x="${cfg.padX}" y="36" fill="#f0f6fc" font-family="'DejaVu Sans', sans-serif" font-size="18" font-weight="700">Reactive Matrix Advisor</text>`,
    `  <text x="${cfg.padX}" y="58" fill="#8b949e" font-family="'DejaVu Sans Mono', monospace" font-size="11.5">${escapeXml(subtitle)}</text>`,
    `  <text x="${cfg.padX}" y="78" fill="#6e7681" font-family="'DejaVu Sans Mono', monospace" font-size="10.5">Each profile shows key criteria weights (%) and Top-3 engines</text>`,
    renderCriteriaLegend(cfg.padX, 99),
    `  <line x1="${cfg.padX}" y1="116" x2="${cfg.width - cfg.padX}" y2="116" stroke="#21262d" stroke-width="1" />`,
    cardsSvg,
    `  <text x="${cfg.padX}" y="${totalHeight - 34}" fill="#6e7681" font-family="'DejaVu Sans Mono', monospace" font-size="10.5">${escapeXml(footerLine1)}</text>`,
    `  <text x="${cfg.padX}" y="${totalHeight - 16}" fill="#6e7681" font-family="'DejaVu Sans Mono', monospace" font-size="10.5">${escapeXml(footerLine2)}</text>`,
    `</svg>`,
  ].join('\n')
}, 'svg:mobileOutput')

const outPath = new URL('./matrix-report-mobile.svg', resultsDir)
fs.writeFileSync(outPath, svgOutputComputed.value)
console.log('Мобильная диаграмма ./results/matrix-report-mobile.svg успешно сгенерирована!')