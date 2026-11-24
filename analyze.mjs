import fs from 'node:fs'
import path from 'node:path'

// 1. Чтение .env без внешних библиотек (Node 22+)
const envPath = new URL('./.env', import.meta.url)
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim()
      const val = trimmed.slice(eqIdx + 1).trim()
      if (!process.env[key]) process.env[key] = val
    }
  }
}

const DEFAULT_COLLIDER_URL =
  'https://raw.githubusercontent.com/pravosleva/mol-collider-benchmark/refs/heads/master/results/last-benchmark.json'
const DEFAULT_MEMORY_URL =
  'https://raw.githubusercontent.com/pravosleva/reactive-memory-benchmark/refs/heads/master/results/last-benchmark.json'

async function loadJsonSource(localPathEnv, urlEnv, fallbackUrl) {
  if (localPathEnv) {
    const resolved = path.resolve(process.cwd(), localPathEnv)
    if (fs.existsSync(resolved)) {
      console.log(`📂 Загружен локальный файл: ${resolved}`)
      return JSON.parse(fs.readFileSync(resolved, 'utf8'))
    }
  }
  const targetUrl = urlEnv || fallbackUrl
  console.log(`🌐 Загрузка данных по URL: ${targetUrl}`)
  const res = await fetch(targetUrl)
  if (!res.ok) throw new Error(`HTTP ${res.status} при загрузке ${targetUrl}`)
  return res.json()
}

// Нормализация имён движков между двумя репозиториями (например, "MobX (comparer.structural)" -> "MobX")
const normalizeName = (name) => name.replace(/\s*\(comparer\.structural\)/, '').trim()

// Архитектурные свойства библиотек (оценка от 0 до 100 по наличию "батареек" для продакшена)
// isolation: встроенная изоляция инстансов для SSR и микрофронтендов (без глобальных синглтонов)
// ergonomics: DI / сервисный слой / встроенные компараторы / богатый жизненный цикл
const ARCH_TRAITS = {
  '@pravosleva/reactive-engine': { isolation: 100, ergonomics: 95, tag: 'Full-featured Engine + DI' },
  '@angular/core (Signals)': { isolation: 95, ergonomics: 90, tag: 'Framework Signals + DI' },
  '@vue/reactivity': { isolation: 85, ergonomics: 85, tag: 'Balanced Core + EffectScope' },
  'MobX': { isolation: 90, ergonomics: 92, tag: 'OOP Observable + Comparers' },
  '$mol ($mol_wire_let)': { isolation: 80, ergonomics: 85, tag: 'Quantum Graph + Deep Compare' },
  'SolidJS 2 (@solidjs/signals)': { isolation: 85, ergonomics: 80, tag: 'Root-scoped Signals' },
  'Reatom (@reatom/core)': { isolation: 95, ergonomics: 90, tag: 'Transactional Atom Graph' },
  'Effector': { isolation: 95, ergonomics: 92, tag: 'Static Domain Stores (Fork API)' },
  'alien-signals': { isolation: 45, ergonomics: 45, tag: 'Low-level Primitive' },
  '@preact/signals-core': { isolation: 55, ergonomics: 55, tag: 'Minimalist Signal Primitive' },
}

// 6 продуктовых сценариев (каждый с весами для Desktop и Mobile Low-RAM)
// Веса: speed (ops/sec), smartGraph (минимум hard() calls), nodeMem (Node B), tickMem (Tick Alloc B), leak (Leak B/cyc), isolation, ergonomics
const SCENARIOS = [
  {
    id: 'gis-maps',
    title: '1. Географические карты (GIS, API-запросы, кластеры точек и попапы)',
    description:
      'Поток координат pan/zoom, фильтрация видимых маркеров по bbox без перерисовки неизменных точек, динамическое открытие/закрытие карточек объектов.',
    weights: {
      desktop: { speed: 0.25, smartGraph: 0.25, nodeMem: 0.05, tickMem: 0.20, leak: 0.15, isolation: 0.05, ergonomics: 0.05 },
      mobile: { speed: 0.15, smartGraph: 0.20, nodeMem: 0.20, tickMem: 0.25, leak: 0.15, isolation: 0.00, ergonomics: 0.05 },
    },
  },
  {
    id: 'multi-step-forms',
    title: '2. Многошаговые формы (валидация, условные ветки, загрузка файлов)',
    description:
      'Сложные графы зависимых полей, ленивое отсечение неактивных шагов мастера, асинхронные статусы загрузки файлов и очистка при смене шага.',
    weights: {
      desktop: { speed: 0.20, smartGraph: 0.30, nodeMem: 0.05, tickMem: 0.05, leak: 0.10, isolation: 0.10, ergonomics: 0.20 },
      mobile: { speed: 0.15, smartGraph: 0.25, nodeMem: 0.20, tickMem: 0.10, leak: 0.15, isolation: 0.05, ergonomics: 0.10 },
    },
  },
  {
    id: 'mfe-cabinet',
    title: '3. Личный кабинет на микрофронтендах (MFE разных команд)',
    description:
      'Несколько независимых модулей на одной странице, строгая изоляция сторов без конфликтов глобального состояния и полное уничтожение модуля при уходе.',
    weights: {
      desktop: { speed: 0.15, smartGraph: 0.15, nodeMem: 0.05, tickMem: 0.05, leak: 0.20, isolation: 0.25, ergonomics: 0.15 },
      mobile: { speed: 0.10, smartGraph: 0.10, nodeMem: 0.25, tickMem: 0.10, leak: 0.25, isolation: 0.15, ergonomics: 0.05 },
    },
  },
  {
    id: 'ssr-apps',
    title: '4. Серверный рендеринг (SSR: Next.js, Nuxt, Angular Universal)',
    description:
      'Создание изолированного графа на каждый HTTP-запрос, быстрая гидратация и гарантированное освобождение памяти после отправки HTML.',
    weights: {
      desktop: { speed: 0.20, smartGraph: 0.15, nodeMem: 0.10, tickMem: 0.05, leak: 0.15, isolation: 0.25, ergonomics: 0.10 },
      mobile: { speed: 0.15, smartGraph: 0.10, nodeMem: 0.25, tickMem: 0.10, leak: 0.20, isolation: 0.15, ergonomics: 0.05 },
    },
  },
  {
    id: 'realtime-telemetry',
    title: '5. Реалтайм-дашборды и стриминг (WebSocket, графики, тикеры)',
    description:
      'Десятки обновлений в секунду: критично отсутствие микрофризов от Minor GC (минимальный Tick Alloc) и пакетное слияние изменений.',
    weights: {
      desktop: { speed: 0.30, smartGraph: 0.15, nodeMem: 0.05, tickMem: 0.30, leak: 0.10, isolation: 0.05, ergonomics: 0.05 },
      mobile: { speed: 0.20, smartGraph: 0.10, nodeMem: 0.20, tickMem: 0.35, leak: 0.10, isolation: 0.00, ergonomics: 0.05 },
    },
  },
  {
    id: 'massive-grid',
    title: '6. Крупные таблицы и редактор формул (10 000+ реактивных ячеек)',
    description:
      'Десятки тысяч одновременно живущих узлов с перекрёстными зависимостями: решает минимальный вес узла и ленивый пересчёт только видимых ячеек.',
    weights: {
      desktop: { speed: 0.25, smartGraph: 0.25, nodeMem: 0.25, tickMem: 0.10, leak: 0.05, isolation: 0.05, ergonomics: 0.05 },
      mobile: { speed: 0.15, smartGraph: 0.15, nodeMem: 0.45, tickMem: 0.15, leak: 0.05, isolation: 0.00, ergonomics: 0.05 },
    },
  },
  {
    id: 'canvas-node-editor',
    title: '7. Графические и node-based редакторы (Miro, Figma, конструкторы схем)',
    description:
      'Перетаскивание групп связанных блоков 60–120 FPS: критичен нулевой мусор при drag-and-drop (Tick Alloc) и локальный пересчёт только затронутых связей.',
    weights: {
      desktop: { speed: 0.25, smartGraph: 0.25, nodeMem: 0.05, tickMem: 0.30, leak: 0.05, isolation: 0.00, ergonomics: 0.10 },
      mobile: { speed: 0.15, smartGraph: 0.20, nodeMem: 0.20, tickMem: 0.35, leak: 0.05, isolation: 0.00, ergonomics: 0.05 },
    },
  },
  {
    id: 'offline-local-first',
    title: '8. Offline-first / Local-first PWA (долгие сессии, синхронизация дельт)',
    description:
      'Многочасовая работа без перезагрузки вкладки, массовое слияние пакетов синхронизации при появлении сети и строгая защита от утечек памяти (Leak).',
    weights: {
      desktop: { speed: 0.20, smartGraph: 0.20, nodeMem: 0.05, tickMem: 0.10, leak: 0.25, isolation: 0.10, ergonomics: 0.10 },
      mobile: { speed: 0.10, smartGraph: 0.15, nodeMem: 0.25, tickMem: 0.15, leak: 0.25, isolation: 0.05, ergonomics: 0.05 },
    },
  },
]

const colliderData = await loadJsonSource(
  process.env.COLLIDER_JSON_PATH,
  process.env.COLLIDER_JSON_URL,
  DEFAULT_COLLIDER_URL
)
const memoryData = await loadJsonSource(
  process.env.MEMORY_JSON_PATH,
  process.env.MEMORY_JSON_URL,
  DEFAULT_MEMORY_URL
)

// Объединяем метрики двух бенчмарков по имени движка
const memoryMap = new Map(memoryData.results.map((r) => [normalizeName(r.Engine), r]))
const mergedEngines = colliderData.results.map((c) => {
  const key = normalizeName(c.Engine)
  const m = memoryMap.get(key)
  if (!m) throw new Error(`Не найдена пара в memory-benchmark для движка: ${key}`)
  const hardCount = Number.parseInt(String(c['hard() calls']), 10) || 6
  const traits = ARCH_TRAITS[key] || { isolation: 50, ergonomics: 50, tag: 'Reactive Engine' }

  return {
    engine: key,
    version: c.Version || m.Version || '',
    tag: traits.tag,
    opsPerSec: Number(c['ops/sec']),
    bestTimeMs: Number(c['Best Time (ms)']),
    hardCalls: hardCount,
    nodeBytes: Number(m['Node (B)']),
    tickAllocBytes: Number(m['Tick Alloc (B)']),
    leakBytes: Number(m['Leak (B/cycle)']),
    isolation: traits.isolation,
    ergonomics: traits.ergonomics,
  }
})

// Нормализация показателей (0..100 баллов, где 100 — лучший результат в выборке)
const maxOps = Math.max(...mergedEngines.map((e) => e.opsPerSec))
const minNode = Math.min(...mergedEngines.map((e) => e.nodeBytes))
const minTick = Math.min(...mergedEngines.map((e) => e.tickAllocBytes))
const minLeak = Math.min(...mergedEngines.map((e) => e.leakBytes))

const scoredEngines = mergedEngines.map((e) => ({
  ...e,
  norm: {
    speed: (e.opsPerSec / maxOps) * 100,
    // 3 вызова hard() = 100 баллов, 4 = 70, 5 = 40, 6 = 15
    smartGraph: e.hardCalls <= 3 ? 100 : e.hardCalls === 4 ? 70 : e.hardCalls === 5 ? 40 : 15,
    nodeMem: (minNode / Math.max(e.nodeBytes, 1)) * 100,
    tickMem: (minTick / Math.max(e.tickAllocBytes, 1)) * 100,
    // Плавная шкала утечек: <= 15 B/cyc ~ 90-100 баллов, > 400 B/cyc ~ штраф
    leak: Math.max(0, Math.min(100, (minLeak / Math.max(e.leakBytes, minLeak)) * 100)),
    isolation: e.isolation,
    ergonomics: e.ergonomics,
  },
}))

function evaluateProfile(profileWeights) {
  return scoredEngines
    .map((e) => {
      let total = 0
      for (const [k, w] of Object.entries(profileWeights)) {
        total += (e.norm[k] || 0) * w
      }
      return {
        engine: e.engine,
        version: e.version,
        tag: e.tag,
        score: Number(total.toFixed(1)),
        opsPerSec: e.opsPerSec,
        hardCalls: e.hardCalls,
        nodeBytes: e.nodeBytes,
        tickAllocBytes: e.tickAllocBytes,
        leakBytes: e.leakBytes,
      }
    })
    .sort((a, b) => b.score - a.score)
}

const scenarioResults = SCENARIOS.map((sc) => ({
  id: sc.id,
  title: sc.title,
  description: sc.description,
  desktopTop5: evaluateProfile(sc.weights.desktop).slice(0, 5),
  mobileTop5: evaluateProfile(sc.weights.mobile).slice(0, 5),
}))

const report = {
  generatedAt: new Date().toISOString(),
  sources: {
    colliderTimestamp: colliderData.timestamp,
    memoryTimestamp: memoryData.timestamp,
  },
  engines: scoredEngines,
  scenarios: scenarioResults,
}

const resultsDir = new URL('./results/', import.meta.url)
fs.mkdirSync(resultsDir, { recursive: true })
fs.writeFileSync(new URL('./matrix-report.json', resultsDir), JSON.stringify(report, null, 2))

// Генерация README.md
const renderScenarioMd = (sc) => {
  const rows = Array.from({ length: 5 }, (_, idx) => idx)
    .map((idx) => {
      const d = sc.desktopTop5.at(idx)
      const m = sc.mobileTop5.at(idx)
      const dStr = `**${d.engine}** \`${d.version}\` (**${d.score}**) — \`${d.opsPerSec} ops/s\`, \`${d.nodeBytes} B/node\``
      const mStr = `**${m.engine}** \`${m.version}\` (**${m.score}**) — \`${m.nodeBytes} B/node\`, \`${m.tickAllocBytes} B/tick\``
      return `| **#${idx + 1}** | ${dStr} | ${mStr} |`
    })
    .join('\n')

  return `### ${sc.title}

${sc.description}

| Место | 💻 Desktop / Laptop (стандартный ПК) | 📱 Mobile / Low-RAM (жёсткий лимит памяти) |
| :---: | :--- | :--- |
${rows}
`
}

const readmeContent = `# reactive-matrix-advisor

![Reactive Matrix Advisor](./results/matrix-report.png)

Практический матричный анализатор для выбора реактивного движка под реальные продуктовые сценарии (для **Desktop / Laptop** и **Mobile / Low-RAM**), объединяющий замеры двух изолированных стендов:
1. **Вычислительный коллайдер:** [\`mol-collider-benchmark\`](https://github.com) (\`${colliderData.timestamp}\`)
2. **Коллайдер памяти и GC:** [\`reactive-memory-benchmark\`](https://github.com) (\`${memoryData.timestamp}\`)

## Матрица рекомендаций по сценариям (Топ-5)

${scenarioResults.map(renderScenarioMd).join('\n')}

## Как обновить отчёт

\`\`\`bash
cp .env.example .env
node analyze.mjs
\`\`\`
`

fs.writeFileSync(new URL('./README.md', import.meta.url), readmeContent)
console.log('✅ Отчёт ./results/matrix-report.json и ./README.md успешно сгенерированы!')
