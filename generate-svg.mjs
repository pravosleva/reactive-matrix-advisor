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

const CRITERIA_META = [
  { key: 'speed', label: 'Speed', short: 'Spd', color: '#38bdf8' },
  { key: 'smartGraph', label: 'SmartGraph', short: 'Grp', color: '#818cf8' },
  { key: 'nodeMem', label: 'NodeMem', short: 'Node', color: '#f43f5e' },
  { key: 'tickMem', label: 'TickMem', short: 'Tick', color: '#fb923c' },
  { key: 'leak', label: 'Leak', short: 'Leak', color: '#facc15' },
  { key: 'isolation', label: 'Isolation', short: 'Iso', color: '#2dd4bf' },
  { key: 'ergonomics', label: 'DX', short: 'DX', color: '#4ade80' },
]

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
}

const renderCriteriaLegend = (startX, y) => {
  let cursorX = startX
  return CRITERIA_META.map((item) => {
    const itemSvg = [
      `  <rect x="${cursorX}" y="${y - 9}" width="11" height="11" rx="2" fill="${item.color}" />`,
      `  <text x="${cursorX + 16}" y="${y}" fill="#c9d1d9" font-family="'DejaVu Sans Mono', monospace" font-size="11">${escapeXml(item.label)}</text>`,
    ].join('\n')
    cursorX += 16 + item.label.length * 6.8 + 18
    return itemSvg
  }).join('\n')
}

const renderLaptopIcon = (x, y) => [
  `    <rect x="${x + 2}" y="${y - 9}" width="12" height="8" rx="1.5" fill="none" stroke="#3b82f6" stroke-width="1.4" />`,
  `    <line x1="${x}" y1="${y + 1}" x2="${x + 16}" y2="${y + 1}" stroke="#3b82f6" stroke-width="1.6" stroke-linecap="round" />`,
].join('\n')

const renderMobileIcon = (x, y) => [
  `    <rect x="${x + 3}" y="${y - 10}" width="9" height="13" rx="1.8" fill="none" stroke="#10b981" stroke-width="1.4" />`,
  `    <circle cx="${x + 7.5}" cy="${y + 0.8}" r="0.8" fill="#10b981" />`,
].join('\n')

// Ровная составная полоска весов без скругления сегментов + подпись ключевых весов
const renderWeightsStrip = (weightsObj, x, y, totalWidth) => {
  const active = CRITERIA_META
    .map((m) => ({ ...m, weight: Number(weightsObj?.[m.key] ?? 0) }))
    .filter((item) => item.weight > 0)

  let cursorX = x
  const barHeight = 6
  const segments = active.map((item, idx) => {
    const segW = idx === active.length - 1
      ? Math.max(2, x + totalWidth - cursorX)
      : Math.max(2, Math.round(item.weight * totalWidth))
    const rect = `    <rect x="${cursorX}" y="${y}" width="${segW}" height="${barHeight}" fill="${item.color}" />`
    cursorX += segW
    return rect
  })

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

const renderTopList = (list, baseX, baseY, accentColor) =>
  list
    .slice(0, 3)
    .map((item, idx) => {
      const y = baseY + idx * 26
      const isFirst = idx === 0
      const rankColor = isFirst ? accentColor : '#8b949e'
      const textColor = isFirst ? '#f0f6fc' : '#c9d1d9'
      const weight = isFirst ? '700' : '500'
      const barMax = 115
      const barW = Math.max(8, Math.round((item.score / 100) * barMax))
      const barFill = isFirst ? accentColor : '#475569'
      const label = `${item.engine} ${item.version}`.trim()

      return [
        `    <text x="${baseX}" y="${y}" fill="${rankColor}" font-family="'DejaVu Sans Mono', monospace" font-size="12" font-weight="700">#${idx + 1}</text>`,
        `    <text x="${baseX + 24}" y="${y}" fill="${textColor}" font-family="'DejaVu Sans', sans-serif" font-size="12" font-weight="${weight}">${escapeXml(label)}</text>`,
        `    <rect x="${baseX + 280}" y="${y - 9}" width="${barMax}" height="9" rx="3" fill="#21262d" />`,
        `    <rect x="${baseX + 280}" y="${y - 9}" width="${barW}" height="9" rx="3" fill="${barFill}" />`,
        `    <text x="${baseX + 465}" y="${y}" text-anchor="end" fill="${rankColor}" font-family="'DejaVu Sans Mono', monospace" font-size="12" font-weight="700">${item.score.toFixed(1)}</text>`,
      ].join('\n')
    })
    .join('\n')

// ============================================================================
// Реактивный расчёт геометрии и SVG на @pravosleva/reactive-engine
// ============================================================================
const engine = new ReactiveEngine()
const reportSig = engine.signal(rawData, 'svg:desktopReport')
const layoutSig = engine.signal(
  {
    width: 1120,
    headerHeight: 128,
    cardHeight: 184,
    cardGap: 14,
    footerHeight: 56,
  },
  'svg:desktopLayout'
)

const svgOutputComputed = engine.computed(() => {
  const data = reportSig.value
  const cfg = layoutSig.value
  const scenarios = data.scenarios
  const height =
    cfg.headerHeight + scenarios.length * (cfg.cardHeight + cfg.cardGap) + cfg.footerHeight

  const cardsSvg = scenarios
    .map((sc, idx) => {
      const y = cfg.headerHeight + idx * (cfg.cardHeight + cfg.cardGap)
      const leftX = 38
      const rightX = 582
      const colWidth = 465
      const weights = sc.weights ?? FALLBACK_WEIGHTS[sc.id] ?? {}

      return [
        `  <g transform="translate(0, ${y})">`,
        `    <rect x="20" y="0" width="${cfg.width - 40}" height="${cfg.cardHeight}" rx="10" fill="#161b22" stroke="#30363d" stroke-width="1" />`,
        `    <text x="${leftX}" y="26" fill="#f0f6fc" font-family="'DejaVu Sans', sans-serif" font-size="14" font-weight="700">${escapeXml(sc.title)}</text>`,
        `    <line x1="36" y1="36" x2="${cfg.width - 36}" y2="36" stroke="#21262d" stroke-width="1" />`,
        // Левая колонка: Desktop
        renderLaptopIcon(leftX, 53),
        `    <text x="${leftX + 22}" y="54" fill="#3b82f6" font-family="'DejaVu Sans Mono', monospace" font-size="11" font-weight="700">DESKTOP / LAPTOP (TOP-3)</text>`,
        renderWeightsStrip(weights.desktop, leftX, 61, colWidth),
        renderTopList(sc.desktopTop5, leftX, 102, '#3b82f6'),
        // Центральный разделитель
        `    <line x1="560" y1="44" x2="560" y2="${cfg.cardHeight - 14}" stroke="#21262d" stroke-width="1" />`,
        // Правая колонка: Mobile
        renderMobileIcon(rightX, 53),
        `    <text x="${rightX + 22}" y="54" fill="#10b981" font-family="'DejaVu Sans Mono', monospace" font-size="11" font-weight="700">MOBILE / LOW-RAM (TOP-3)</text>`,
        renderWeightsStrip(weights.mobile, rightX, 61, colWidth),
        renderTopList(sc.mobileTop5, rightX, 102, '#10b981'),
        `  </g>`,
      ].join('\n')
    })
    .join('\n')

  const subtitle = `Sources: mol-collider (${data.sources.colliderTimestamp.slice(0, 10)}) + reactive-memory (${data.sources.memoryTimestamp.slice(0, 10)})`
  const footer = `Generated: ${data.generatedAt} | Score: 0..100 weighted index (Speed, SmartGraph, NodeMem, TickMem, Leak, Isolation, DX)`

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="${SVG_NS}" width="${cfg.width}" height="${height}" viewBox="0 0 ${cfg.width} ${height}">`,
    `  <rect width="100%" height="100%" rx="14" fill="#0d1117" stroke="#30363d" stroke-width="1.5" />`,
    `<text x="32" y="40" fill="#f0f6fc" font-family="'DejaVu Sans', sans-serif" font-size="20" font-weight="700">Reactive Matrix Advisor — Scenario Selection (Desktop vs Mobile)</text>`,
      `<text x="32" y="64" fill="#8b949e" font-family="'DejaVu Sans Mono', monospace" font-size="12">${escapeXml(subtitle)}</text>`,
    renderCriteriaLegend(32, 90),
      `<line x1="20" y1="108" x2="${cfg.width - 20}" y2="108" stroke="#21262d" stroke-width="1" />`,
    cardsSvg,
      `<text x="32" y="${height - 20}" fill="#6e7681" font-family="'DejaVu Sans Mono', monospace" font-size="11">${escapeXml(footer)}</text>`,
    '</svg>',
  ].join('\n')
}, 'svg:desktopOutput')
fs.writeFileSync(new URL('./matrix-report.svg', resultsDir), svgOutputComputed.value)
console.log('Диаграмма ./results/matrix-report.svg успешно сгенерирована!')
