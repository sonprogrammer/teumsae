import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import postcss from 'postcss'

const stylesheet = postcss.parse(await readFile(new URL('../app/globals.css', import.meta.url), 'utf8'))

function declarationsForSelector(selector, mediaCondition) {
  const declarations = {}
  const collect = root => root.walkRules(selector, rule => rule.walkDecls(declaration => {
    declarations[declaration.prop] = declaration.value
  }))

  if (!mediaCondition) {
    collect(stylesheet)
    return declarations
  }

  stylesheet.walkAtRules('media', rule => {
    if (rule.params !== mediaCondition) return
    collect(rule)
  })
  return declarations
}

function declarationsForBaseSelector(selector) {
  const declarations = {}
  stylesheet.walkRules(selector, rule => {
    let parent = rule.parent
    while (parent && parent.type !== 'root') {
      if (parent.type === 'atrule') return
      parent = parent.parent
    }
    rule.walkDecls(declaration => {
      declarations[declaration.prop] = declaration.value
    })
  })
  return declarations
}

test('lets the edit form use the full event card width', () => {
  const declarations = declarationsForSelector('.real-event-form')
  assert.equal(declarations['grid-column'], '1 / -1')
})

test('stacks date and time controls on narrow mobile viewports', () => {
  const declarations = declarationsForSelector('.real-datetime-fields', '(max-width: 480px)')
  assert.equal(declarations['grid-template-columns'], 'minmax(0, 1fr)')
})

test('stacks the calendar and agenda when the viewport cannot fit both panels', () => {
  const declarations = declarationsForSelector('.real-schedule-workspace', '(max-width: 1200px)')
  assert.equal(declarations['grid-template-columns'], 'minmax(0, 1fr)')
})

test('centers a wider two-column schedule layout on desktop', () => {
  assert.equal(declarationsForBaseSelector('.real-schedule-content')['max-width'], '1500px')
  assert.equal(declarationsForBaseSelector('.real-schedule-header')['max-width'], '1500px')
  assert.equal(declarationsForBaseSelector('.real-schedule-workspace')['grid-template-columns'], 'minmax(0, 1.7fr) minmax(340px, .9fr)')
})

test('uses the provided Teumsae AI artwork in the floating launcher', async () => {
  const source = await readFile(new URL('../components/assistant-panel.tsx', import.meta.url), 'utf8')
  assert.match(source, /src="\/teumsaeAI\.png"/)
  assert.match(source, /alt=""/)
})

test('keeps the launcher label close to the artwork despite its transparent padding', () => {
  assert.equal(declarationsForBaseSelector('.assistant-live-launcher')['gap'], '3px')
  assert.equal(declarationsForBaseSelector('.assistant-live-launcher img')['margin-left'], '-14px')
  assert.equal(declarationsForBaseSelector('.assistant-live-launcher img')['margin-right'], '-14px')
})

test('keeps the desktop AI conversation collapsed beside a persistent floating launcher', () => {
  const panel = declarationsForBaseSelector('.assistant-live-panel')
  const openPanel = declarationsForBaseSelector('.assistant-live-panel.is-open')
  assert.equal(panel['position'], 'fixed')
  assert.equal(panel['visibility'], 'hidden')
  assert.equal(panel['transform-origin'], 'bottom right')
  assert.equal(openPanel['visibility'], 'visible')
  assert.equal(declarationsForBaseSelector('.assistant-live-launcher')['position'], 'fixed')
  assert.equal(declarationsForBaseSelector('.assistant-live-launcher')['display'], 'flex')
})

test('opens the mobile AI panel as an animated bottom sheet with a dismissible backdrop', () => {
  const panel = declarationsForSelector('.assistant-live-panel', '(max-width: 700px)')
  const openPanel = declarationsForSelector('.assistant-live-panel.is-open', '(max-width: 700px)')
  assert.equal(panel['transform'], 'translate3d(0, 100%, 0)')
  assert.equal(openPanel['transform'], 'translate3d(0, 0, 0)')
  assert.equal(declarationsForSelector('.assistant-live-backdrop', '(max-width: 700px)')['display'], 'block')
  assert.equal(declarationsForBaseSelector('.assistant-live-panel')['visibility'], 'hidden')
  assert.equal(declarationsForBaseSelector('.assistant-live-panel.is-open')['visibility'], 'visible')
  assert.equal(declarationsForBaseSelector('.assistant-live-launcher')['display'], 'flex')
})

test('suggests checking availability settings when no free intervals or candidates exist', async () => {
  const source = await readFile(new URL('../components/assistant-panel.tsx', import.meta.url), 'utf8')
  assert.match(source, /해당 날짜가 불가일로 설정됐는지 확인해 주세요/)
  assert.equal((source.match(/<AvailabilityEmptyState \/>/g) ?? []).length, 2)
})

test('shows candidates three at a time without another request', async () => {
  const source = await readFile(new URL('../components/assistant-panel.tsx', import.meta.url), 'utf8')
  assert.match(source, /visibleCandidateCount, setVisibleCandidateCount\] = useState\(3\)/)
  assert.match(source, /candidates\.slice\(0, visibleCandidateCount\)/)
  assert.match(source, /setVisibleCandidateCount\(current => current \+ 3\)/)
  assert.match(source, /후보 \{Math\.min\(3, result\.candidates\.length - visibleCandidateCount\)\}개 더 보기/)
})
