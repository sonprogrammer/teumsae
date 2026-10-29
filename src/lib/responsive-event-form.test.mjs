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

test('opens the AI panel from a mobile launcher without showing an inactive drawer', () => {
  assert.equal(declarationsForSelector('.assistant-live-panel', '(max-width: 700px)')['display'], 'none')
  assert.equal(declarationsForSelector('.assistant-live-panel.is-open', '(max-width: 700px)')['display'], 'flex')
  assert.equal(declarationsForSelector('.assistant-live-launcher', '(max-width: 700px)')['display'], 'flex')
})
