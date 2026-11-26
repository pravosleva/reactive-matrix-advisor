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

// -- Архитектурные свойства библиотек (оценка от 0 до 100 по наличию "батареек" для продакшена)
// isolation: встроенная изоляция инстансов для SSR и микрофронтендов (без глобальных синглтонов)
// ergonomics: DI / сервисный слой / встроенные компараторы / богатый жизненный цикл

// Бинарная матрица возможностей API (1 — поддерживается из коробки, 0 — нет)
const ENGINE_CAPABILITIES = {
  '@pravosleva/reactive-engine': {
    tag: 'Full-featured Engine + DI',
    isolationFlags: {
      scopedContainer: 1,     // new ReactiveEngine() на запрос / модуль
      // NOTE: На всякий случай
      // - «На запрос» означает, что new ReactiveEngine() создаётся внутри обработчика каждого входящего HTTP-запроса (или внутри корневого компонента дерева рендера на сервере), живёт ровно столько, сколько рендерится страница для этого конкретного пользователя, и после отправки HTML-ответа полностью уничтожается сборщиком мусора.
      // - А «на модуль» (per module / microfrontend) — это клиентский аналог той же изоляции: когда в одном большом приложении работают несколько независимых микрофронтендов или виджетов разных команд, и каждый из них поднимает свой собственный изолированный new ReactiveEngine(), не пересекаясь с соседями.
      noGlobalSingletons: 1,  // полное отсутствие глобального состояния
      snapshotHydration: 0,   // нет встроенного API снимков в ядре; реализуется паттерном в сервисах (это, кстати легко добавить)
      cascadeDispose: 1,      // очистка подписок и ресурсов
    },
    ergonomicsFlags: {
      builtInDi: 1,           // AbstractService + engine.inject()
      customEquals: 1,        // опция { equals } в computed
      batchingSupport: 1,     // engine.batch()
      asyncPrimitive: 1,      // engine.resource() с AbortSignal и retry
      deepReactive: 1,        // engine.reactive() (Proxy)
    },
    rationale:
      'Изолированные инстансы `ReactiveEngine` без глобального состояния, контракт `exportSnapshot`/`hydrate`, встроенный DI (`AbstractService`), `{ equals }`, `batch()`, `resource()` с `AbortSignal` и глубокий Proxy `reactive()`.',
  },
  '@angular/core (Signals)': {
    tag: 'Framework Signals + DI',
    isolationFlags: {
      scopedContainer: 1,     // иерархический DI Angular
      noGlobalSingletons: 1,  // изоляция на уровне компонентов/маршрутов
      snapshotHydration: 1,   // TransferState
      cascadeDispose: 1,      // автоматическая очистка через DestroyRef
    },
    ergonomicsFlags: {
      builtInDi: 1,           // inject() / @Injectable
      customEquals: 1,        // computed(..., { equal })
      batchingSupport: 1,     // автоматический батчинг эффектов в планировщике Angular
      asyncPrimitive: 1,      // resource() / rxResource() в Angular 19+
      deepReactive: 0,        // сигналы работают по ссылке (без глубокого Proxy). В Angular Signals (вплоть до актуального Angular 21–22) встроенного глубокого реактивного Proxy (deep reactive / makeAutoObservable как в Vue reactive(), MobX или engine.reactive()) действительно нет — команда Angular сознательно отказалась от глубокой мутабельности в пользу иммутабельных обновлений сигналов через .set() / .update().
    },
    rationale:
      'Полная изоляция через иерархический DI, `TransferState` для SSR, автоочистка через `DestroyRef`, встроенный батчинг, `{ equal }` и `resource()`. Минус 20% только за отсутствие глубоких Proxy-коллекций (иммутабельная модель).',
  },
  'Reatom (@reatom/core)': {
    tag: 'Transactional Atom Graph',
    isolationFlags: {
      scopedContainer: 1,     // контексты выполнения (createCtx / wrap)
      noGlobalSingletons: 1,  // изоляция состояния по контекстам
      snapshotHydration: 1,   // встроенная сериализация снимков (snapshot)
      cascadeDispose: 1,      // иерархическая отмена и очистка подписок
    },
    ergonomicsFlags: {
      builtInDi: 1,           // композиция фабрик и контекста
      customEquals: 1,        // встроенная мемоизация и компараторы
      batchingSupport: 1,        // транзакционный батчинг (notify / batch)
      asyncPrimitive: 1,      // reatomAsync / эффекты с отменой
      deepReactive: 0,        // иммутабельная модель атомов (без Proxy)
    },
    rationale:
      'Изоляция через контексты выполнения (`createCtx`), сериализация снимков, иерархическая очистка, композиция фабрик, транзакционный батчинг и `reatomAsync`. Без глубоких Proxy-объектов.',
  },
  'Effector': {
    tag: 'Static Domain Stores (Fork API)',
    isolationFlags: {
      scopedContainer: 1,     // fork() / Scope
      noGlobalSingletons: 1,  // полная изоляция в Scope для SSR
      snapshotHydration: 1,   // serialize() / fork({ values })
      cascadeDispose: 1,      // clearNode() / сборка Scope
    },
    ergonomicsFlags: {
      builtInDi: 1,           // Domain и фабрики юнитов
      customEquals: 1,        // updateFilter в createStore
      batchingSupport: 1,        // встроенная очередь батчинга
      asyncPrimitive: 1,      // createEffect с pending/finally
      deepReactive: 0,        // строго иммутабельные сторы
    },
    rationale:
      'Эталонная SSR-изоляция через `Fork API` (`fork`, `serialize`, `clearNode`), доменная декомпозиция, `updateFilter`, встроенная очередь батчинга и эффекты. Строго иммутабельные сторы без глубокого Proxy.',
  },
  'MobX': {
    tag: 'OOP Observable + Comparers',
    isolationFlags: {
      scopedContainer: 1,     // локальные инстансы классов-сторов
      noGlobalSingletons: 1,  // enableStaticRendering(true) для SSR
      snapshotHydration: 1,   // гидратация полей стора
      cascadeDispose: 0,      // каждый autorun/reaction отписывается вручную
    },
    ergonomicsFlags: {
      builtInDi: 0,           // нет встроенного DI-контейнера
      customEquals: 1,        // comparer.structural / кастомный equals
      batchingSupport: 1,        // runInAction / action
      asyncPrimitive: 1,      // flow() с генераторами и отменой
      deepReactive: 1,        // makeAutoObservable (глубокий Proxy)
    },
    rationale:
      'Изоляция через локальные инстансы сторов и `enableStaticRendering`, `comparer.structural`, `runInAction`, `flow()` и глубокий Proxy `makeAutoObservable`. Нет каскадной очистки подграфа одной командой и встроенного DI.',
  },
  '@vue/reactivity': {
    tag: 'Balanced Core + EffectScope',
    isolationFlags: {
      scopedContainer: 1,     // effectScope()
      noGlobalSingletons: 1,  // при создании внутри setup() / useState()
      snapshotHydration: 0,   // в голом @vue/reactivity нет (только в Nuxt)
      cascadeDispose: 1,      // scope.stop()
    },
    ergonomicsFlags: {
      builtInDi: 0,           // нет в @vue/reactivity (provide/inject в runtime-core)
      customEquals: 0,        // нет опции equals в computed (только Object.is)
      batchingSupport: 1,        // внутренний батчинг планировщика
      asyncPrimitive: 0,      // нет в @vue/reactivity
      deepReactive: 1,        // reactive() (глубокий Proxy)
    },
    rationale:
      'В изолированном пакете `@vue/reactivity` есть `effectScope` с каскадным `stop()`, внутренний батчинг и глубокий Proxy `reactive()`, но отсутствуют DI, опция `equals` в `computed`, `resource()` и SSR-гидратация (доступны только в Vue/Nuxt).',
  },
  'SolidJS 2 (@solidjs/signals)': {
    tag: 'Root-scoped Signals',
    isolationFlags: {
      scopedContainer: 1,     // createRoot()
      noGlobalSingletons: 1,  // граф привязан к владельцу (Owner)
      snapshotHydration: 0,   // в @solidjs/signals нет (только в SolidStart)
      cascadeDispose: 1,      // dispose() корневого createRoot
    },
    ergonomicsFlags: {
      builtInDi: 0,           // нет в @solidjs/signals
      customEquals: 1,        // опция { equals } в createMemo и createSignal
      batchingSupport: 1,        // автоматический батчинг + flush()
      asyncPrimitive: 1,      // встроенная поддержка Promise в createMemo (Solid 2)
      deepReactive: 0,        // в @solidjs/signals только атомарные сигналы
    },
    rationale:
      'Изоляция подграфов и каскадный `dispose` через `createRoot`, встроенный `{ equals }`, `flush()` и нативная поддержка `Promise` внутри `createMemo`. В пакете сигналов нет DI, SSR-сериализации и глубокого Proxy.',
  },
  '$mol ($mol_wire_let)': {
    tag: 'Quantum Graph + Deep Compare',
    isolationFlags: {
      scopedContainer: 1,     // $mol_ambient (контекст this.$)
      noGlobalSingletons: 1,  // изоляция через дерево владения
      snapshotHydration: 0,   // нет отдельного API снимков в mol_wire_lib
      cascadeDispose: 1,      // детерминированный вызов destructor()
    },
    ergonomicsFlags: {
      builtInDi: 1,           // наследование контекста this.$
      customEquals: 1,        // встроенный $mol_compare_deep на каждый атом
      batchingSupport: 1,        // отложенный пересчёт до кадра / чтения
      asyncPrimitive: 1,      // прозрачный sync-over-async и $mol_wire_sync
      deepReactive: 0,        // мемоизация свойств вместо глубокого Proxy
    },
    rationale:
      'Контекст наследования `this.$` (`$mol_ambient`), детерминированные деструкторы, встроенный `$mol_compare_deep`, автобатчинг и прозрачный `sync-over-async`. Нет отдельного API снимков для SSR и глубокого Proxy (используется мемоизация свойств).',
  },
  'alien-signals': {
    tag: 'Low-level Primitive',
    isolationFlags: {
      scopedContainer: 1,     // effectScope() в v3+
      noGlobalSingletons: 1,  // локальные замыкания
      snapshotHydration: 0,   // отсутствует
      cascadeDispose: 1,      // остановка effectScope
    },
    ergonomicsFlags: {
      builtInDi: 0,           // отсутствует
      customEquals: 0,        // только ===
      batchingSupport: 1,        // startBatch() / endBatch()
      asyncPrimitive: 0,      // отсутствует
      deepReactive: 0,        // отсутствует
    },
    rationale:
      'Минималистичный push-pull примитив: в v3+ есть `effectScope` для каскадной отписки и `startBatch`/`endBatch`, но полностью отсутствуют DI, компараторы, асинхронные ресурсы и Proxy.',
  },
  '@preact/signals-core': {
    tag: 'Minimalist Signal Primitive',
    isolationFlags: {
      scopedContainer: 0,     // нет effectScope / createRoot в core
      noGlobalSingletons: 1,  // можно создавать локально, но без контекста
      snapshotHydration: 0,   // отсутствует
      cascadeDispose: 0,      // каждый effect() отписывается отдельно
    },
    ergonomicsFlags: {
      builtInDi: 0,           // отсутствует
      customEquals: 0,        // только ===
      batchingSupport: 1,        // batch()
      asyncPrimitive: 0,      // отсутствует
      deepReactive: 0,        // отсутствует
    },
    rationale:
      'Самый аскетичный примитив: из коробки есть только локальное создание сигналов без глобального реестра и `batch()`. Нет ни `effectScope`, ни компараторов, ни DI, ни ресурсов.',
  },
}
// --

const countOnes = (flagsObj) => Object.values(flagsObj).filter(Boolean).length

const ARCH_TRAITS = Object.fromEntries(
  Object.entries(ENGINE_CAPABILITIES).map(([name, cfg]) => {
    const isoCount = countOnes(cfg.isolationFlags)
    const isoTotal = Object.keys(cfg.isolationFlags).length
    const ergCount = countOnes(cfg.ergonomicsFlags)
    const ergTotal = Object.keys(cfg.ergonomicsFlags).length

    return [
      name,
      {
        isolation: Math.round((isoCount / isoTotal) * 100),
        isolationFraction: `${isoCount}/${isoTotal}`,
        ergonomics: Math.round((ergCount / ergTotal) * 100),
        ergonomicsFraction: `${ergCount}/${ergTotal}`,
        isolationFlags: cfg.isolationFlags,
        ergonomicsFlags: cfg.ergonomicsFlags,
        rationale: cfg.rationale,
        tag: cfg.tag,
      },
    ]
  })
)

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

const versionByEngine = new Map(mergedEngines.map((e) => [e.engine, e.version]))

const archTableHeader = [
  '| Движок | `isolation` | `ergonomics` | Почему выставлены именно такие значения |',
  '| :--- | :---: | :---: | :--- |',
].join('\n')

const archTableRows = Object.entries(ARCH_TRAITS)
  .sort((a, b) => b.at(1).isolation + b.at(1).ergonomics - (a.at(1).isolation + a.at(1).ergonomics))
  .map(([name, t]) => {
    const ver = versionByEngine.get(name)
    const verBadge = ver ? ` \`${ver}\`` : ''
    return `| **${name}**${verBadge} | **\`${t.isolation}%\`** (${t.isolationFraction}) | **\`${t.ergonomics}%\`** (${t.ergonomicsFraction}) | ${t.rationale} |`
  })
  .join('\n')

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
  title: `Сценарий ${sc.title}`,
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
${rows}`
}

const flagIcon = (val) => (val ? '✅' : '—')

const capabilitiesTableHeader = [
  '| Движок | `isolation` (%) | Scoped Container | No Global Singletons | Snapshot / Hydration | Cascade Dispose | `ergonomics` (%) | Built-in DI | Custom `equals` | Sync Batching | Async Resource | Deep Proxy |',
  '| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |',
].join('\n')

const capabilitiesTableRows = Object.entries(ARCH_TRAITS)
  .sort((a, b) => b[1].isolation + b[1].ergonomics - (a[1].isolation + a[1].ergonomics))
  .map(([name, t]) => {
    const iso = t.isolationFlags
    const erg = t.ergonomicsFlags
    return [
      `| **${name}**`,
      `\`${t.isolation}%\``,
      flagIcon(iso.scopedContainer),
      flagIcon(iso.noGlobalSingletons),
      flagIcon(iso.snapshotHydration),
      flagIcon(iso.cascadeDispose),
      `\`${t.ergonomics}%\``,
      flagIcon(erg.builtInDi),
      flagIcon(erg.customEquals),
      flagIcon(erg.batchingSupport),
      flagIcon(erg.asyncPrimitive),
      `${flagIcon(erg.deepReactive)} |`,
    ].join(' | ')
  })
  .join('\n')

const weightsTableHeader = [
  '| Сценарий | Профиль | `speed` | `smartGraph` | `nodeMem` | `tickMem` | `leak` | `isolation` | `ergonomics` |',
  '| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |',
].join('\n')

const weightsTableRows = SCENARIOS.map((sc) => {
  const d = sc.weights.desktop
  const m = sc.weights.mobile
  return `| **${sc.title}** | 💻 / 📱 | \`${d.speed.toFixed(2)}\` / \`${m.speed.toFixed(2)}\` | \`${d.smartGraph.toFixed(2)}\` / \`${m.smartGraph.toFixed(2)}\` | \`${d.nodeMem.toFixed(2)}\` / \`${m.nodeMem.toFixed(2)}\` | \`${d.tickMem.toFixed(2)}\` / \`${m.tickMem.toFixed(2)}\` | \`${d.leak.toFixed(2)}\` / \`${m.leak.toFixed(2)}\` | \`${d.isolation.toFixed(2)}\` / \`${m.isolation.toFixed(2)}\` | \`${d.ergonomics.toFixed(2)}\` / \`${m.ergonomics.toFixed(2)}\` |`
}).join('\n')

const readmeContent = `# reactive-matrix-advisor

![Reactive Matrix Advisor](./results/matrix-report.png)

Практический матричный анализатор для выбора реактивного движка под реальные продуктовые сценарии (для **Desktop / Laptop** и **Mobile / Low-RAM**), объединяющий физические замеры двух изолированных стендов и чек-лист архитектурных возможностей API:
1. **Вычислительный коллайдер:** [\`mol-collider-benchmark\`](https://github.com/pravosleva/mol-collider-benchmark) (\`${colliderData.timestamp}\`)
2. **Коллайдер памяти и GC:** [\`reactive-memory-benchmark\`](https://github.com/pravosleva/reactive-memory-benchmark) (\`${memoryData.timestamp}\`)

## 1. Матрица рекомендаций по сценариям (Топ-5)

${scenarioResults.map(renderScenarioMd).join('\n\n')}

## 2. Как оцениваются архитектурные свойства движка (\`isolation\` и \`ergonomics\`)

Помимо физических замеров CPU и памяти из первых двух бенчмарков, матрица учитывает наличие готовых архитектурных механизмов «из коробки» (по прозрачной бинарной шкале: \`✅\` = \`1\`, \`—\` = \`0\`).

* **\`isolation\` (4 признака × 25% = 100%):** \`Scoped Container\`, \`No Global Singletons\`, \`Snapshot / Hydration\`, \`Cascade Dispose\`.
* **\`ergonomics\` (5 признаков × 20% = 100%):** \`Built-in DI\`, \`Custom equals\`, \`Batching Support\`, \`Async Resource\`, \`Deep Proxy\`.

${archTableHeader}
${archTableRows}

## 3. Прозрачный чек-лист возможностей API (\`isolation\` и \`ergonomics\`)

Оценки \`isolation\` (4 признака × 25%) и \`ergonomics\` (5 признаков × 20%) вычисляются автоматически из бинарной матрицы признаков (\`1\` — есть из коробки в ядре/адаптере, \`0\` — отсутствует):

${capabilitiesTableHeader}
${capabilitiesTableRows}

## 4. Веса критериев по сценариям (\`Desktop\` / \`Mobile\`)

В каждом профиле сумма всех 7 весов равна \`1.00\` (\`100%\`). В профиле **Mobile / Low-RAM** приоритет смещается в сторону минимального веса узла (\`nodeMem\`), низкого давления на сборщик мусора (\`tickMem\`) и отсутствия утечек (\`leak\`):

${weightsTableHeader}
${weightsTableRows}

## 5. Как обновить отчёт

\`\`\`bash
cp .env.example .env
npm run build
\`\`\`
`

fs.writeFileSync(new URL('./README.md', import.meta.url), readmeContent)
console.log('✅ Отчёт ./results/matrix-report.json и ./README.md успешно сгенерированы!')
