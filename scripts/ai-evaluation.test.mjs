import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAiEvaluationCases, sanitizeAiEvaluationResult, validateAiEvaluationCases } from './ai-evaluation-utils.mjs'

test('defines fifteen unique fixed questions in the issue categories', () => {
  const cases = buildAiEvaluationCases(new Date('2026-10-30T03:00:00.000Z'))
  assert.deepEqual(validateAiEvaluationCases(cases), { ok: true })
  assert.equal(cases.length, 15)
  assert.deepEqual(Object.fromEntries(['lookup', 'availability', 'proposal', 'ambiguity'].map(category => [category, cases.filter(item => item.category === category).length])), { lookup: 3, availability: 4, proposal: 4, ambiguity: 4 })
})

test('rejects malformed evaluation sets instead of silently changing the sample size', () => {
  assert.deepEqual(validateAiEvaluationCases([]), { ok: false, reason: 'invalid_case_count' })
  const cases = buildAiEvaluationCases(new Date('2026-10-30T03:00:00.000Z'))
  assert.deepEqual(validateAiEvaluationCases([...cases.slice(0, 14), cases[0]]), { ok: false, reason: 'duplicate_case_id' })
})

test('writes only whitelisted tool and card summaries to evidence', () => {
  const result = sanitizeAiEvaluationResult({
    id: 'lookup_today',
    category: 'lookup',
    prompt: '개인 일정 원문',
    response: '일정 제목과 내용',
    model: 'test-model',
    answerSource: 'model',
    usage: { totalTokens: 42 },
    toolCalls: [{ name: 'listEvents', status: 'success', durationMs: 12, input: { startDate: '2026-10-30', hasTitleFilter: false }, output: { eventCount: 1 }, rawPrompt: '숨겨야 함' }],
    cards: [{ type: 'events', events: [{ title: '비공개 일정' }] }]
  })
  assert.deepEqual(result, {
    id: 'lookup_today', category: 'lookup', model: 'test-model', answerSource: 'model', totalTokens: 42,
    toolCalls: [{ name: 'listEvents', status: 'success', durationMs: 12, input: { startDate: '2026-10-30', hasTitleFilter: false }, output: { eventCount: 1 } }],
    cardTypes: ['events'], proposalStates: []
  })
  assert.doesNotMatch(JSON.stringify(result), /개인 일정 원문|일정 제목|비공개 일정|숨겨야 함/)
})
