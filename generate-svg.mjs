import fs from 'node:fs'

const SVG_NS = ['http:/', '/www.w3.org', '/2000/svg'].join('')

const resultsDir = new URL('./results/', import.meta.url)
const jsonPath = new URL('./matrix-report.json', resultsDir)

if (!fs.existsSync(jsonPath)) {
  console.error('❌ Файл ./results/matrix-report.json не найден. Сначала запустите: node analyze.mjs')
  process.exit(1)
}

const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
const scenarios = data.scenarios

const escapeXml = (str) =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const width = 1120
const headerHeight = 105
const cardHeight = 148
const cardGap = 14
const footerHeight = 56
const height = headerHeight + scenarios.length * (cardHeight + cardGap) + footerHeight

const renderTopList = (list, baseX, baseY, accentColor) =>
  list
    .slice(0, 3)
    .map((item, idx) => {
      const y = baseY + idx * 28
      const isFirst = idx === 0
      const rankColor = isFirst ? accentColor : '#8b949e'
      const textColor = isFirst ? '#f0f6fc' : '#c9d1d9'
      const weight = isFirst ? '700' : '500'
      const barMax = 120
      const barW = Math.max(8, Math.round((item.score / 100) * barMax))
      const barFill = isFirst ? accentColor : '#475569'
      const label = `${item.engine} ${item.version}`.trim()

      return [
        `    <text x="${baseX}" y="${y}" fill="${rankColor}" font-family="'DejaVu Sans Mono', monospace" font-size="12" font-weight="700">#${idx + 1}</text>`,
        `    <text x="${baseX + 24}" y="${y}" fill="${textColor}" font-family="'DejaVu Sans', sans-serif" font-size="12" font-weight="${weight}">${escapeXml(label)}</text>`,
        `    <rect x="${baseX + 275}" y="${y - 9}" width="${barMax}" height="9" rx="3" fill="#21262d" />`,
        `    <rect x="${baseX + 275}" y="${y - 9}" width="${barW}" height="9" rx="3" fill="${barFill}" />`,
        `    <text x="${baseX + 465}" y="${y}" text-anchor="end" fill="${rankColor}" font-family="'DejaVu Sans Mono', monospace" font-size="12" font-weight="700">${item.score.toFixed(1)}</text>`,
      ].join('\n')
    })
    .join('\n')

const cardsSvg = scenarios
  .map((sc, idx) => {
    const y = headerHeight + idx * (cardHeight + cardGap)
    const leftX = 38
    const rightX = 582

    return [
      `  <g transform="translate(0, ${y})">`,
      `    <rect x="20" y="0" width="${width - 40}" height="${cardHeight}" rx="10" fill="#161b22" stroke="#30363d" stroke-width="1" />`,
      `    <text x="${leftX}" y="26" fill="#f0f6fc" font-family="'DejaVu Sans', sans-serif" font-size="14" font-weight="700">${escapeXml(sc.title)}</text>`,
      `    <line x1="36" y1="36" x2="${width - 36}" y2="36" stroke="#21262d" stroke-width="1" />`,
      `    <text x="${leftX}" y="54" fill="#3b82f6" font-family="'DejaVu Sans Mono', monospace" font-size="11" font-weight="700">DESKTOP / LAPTOP (TOP-3)</text>`,
      `    <text x="${rightX}" y="54" fill="#10b981" font-family="'DejaVu Sans Mono', monospace" font-size="11" font-weight="700">MOBILE / LOW-RAM (TOP-3)</text>`,
      `    <line x1="560" y1="44" x2="560" y2="${cardHeight - 12}" stroke="#21262d" stroke-width="1" />`,
      renderTopList(sc.desktopTop5, leftX, 76, '#3b82f6'),
      renderTopList(sc.mobileTop5, rightX, 76, '#10b981'),
      `  </g>`,
    ].join('\n')
  })
  .join('\n')

const subtitle = `Sources: mol-collider (${data.sources.colliderTimestamp.slice(0, 10)}) + reactive-memory (${data.sources.memoryTimestamp.slice(0, 10)})`
const footer = `Generated: ${data.generatedAt} | Score: 0..100 weighted index (CPU ops/s, hard() pruning, Node B, Tick Alloc B, Dispose Leak & Isolation)`

const svgContent = [
  `<?xml version="1.0" encoding="UTF-8"?>`,
  `<svg xmlns="${SVG_NS}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
  `  <rect width="100%" height="100%" rx="14" fill="#0d1117" stroke="#30363d" stroke-width="1.5" />`,
  `  <text x="32" y="42" fill="#f0f6fc" font-family="'DejaVu Sans', sans-serif" font-size="20" font-weight="700">Reactive Matrix Advisor — Scenario Selection (Desktop vs Mobile)</text>`,
  `  <text x="32" y="66" fill="#8b949e" font-family="'DejaVu Sans Mono', monospace" font-size="12">${escapeXml(subtitle)}</text>`,
  `  <line x1="20" y1="86" x2="${width - 20}" y2="86" stroke="#21262d" stroke-width="1" />`,
  cardsSvg,
  `  <text x="32" y="${height - 20}" fill="#6e7681" font-family="'DejaVu Sans Mono', monospace" font-size="11">${escapeXml(footer)}</text>`,
  `</svg>`,
].join('\n')

fs.writeFileSync(new URL('./matrix-report.svg', resultsDir), svgContent)
console.log('🖼️  Диаграмма ./results/matrix-report.svg успешно сгенерирована!')
