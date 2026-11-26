import fs from 'node:fs'
import { Resvg } from '@resvg/resvg-js'

const resultsDir = new URL('./results/', import.meta.url)

const targets = [
  { svg: 'matrix-report.svg', png: 'matrix-report.png' },
  { svg: 'matrix-report-mobile.svg', png: 'matrix-report-mobile.png' },
]

for (const { svg, png } of targets) {
  const svgPath = new URL(`./${svg}`, resultsDir)
  if (!fs.existsSync(svgPath)) {
    console.warn(`⚠️ Файл ./results/${svg} не найден, пропускаем...`)
    continue
  }

  const svgContent = fs.readFileSync(svgPath, 'utf8')
  const resvg = new Resvg(svgContent, {
    fitTo: { mode: 'zoom', value: 2 }, // 2x Retina для чёткого текста на экранах высокой плотности
    font: {
      loadSystemFonts: true,
      defaultFontFamily: 'DejaVu Sans',
      monospaceFamily: 'DejaVu Sans Mono',
    },
  })

  const pngData = resvg.render()
  const pngBuffer = pngData.asPng()
  fs.writeFileSync(new URL(`./${png}`, resultsDir), pngBuffer)
  console.log(`PNG-отчёт ./results/${png} успешно сгенерирован!`)
}
