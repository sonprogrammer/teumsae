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
