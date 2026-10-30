import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { request } from '@playwright/test'
import { buildAiEvaluationCases, sanitizeAiEvaluationResult, validateAiEvaluationCases } from './ai-evaluation-utils.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const baseURL = process.env.TEUMSAE_EVAL_BASE_URL
const storageState = process.env.TEUMSAE_EVAL_AUTH_STATE
const outputPath = process.env.TEUMSAE_EVAL_OUTPUT ?? resolve(root, 'test-results/ai-evaluation-' + new Date().toISOString().replaceAll(':', '-') + '.json')

function compareExpectedInput(call, expected) {
  return call.name === expected.tool && Object.entries(expected.values).every(([key, value]) => JSON.stringify(call.input?.[key]) === JSON.stringify(value)) && (expected.absent ?? []).every(key => !Object.hasOwn(call.input ?? {}, key))
}

function assessCase(item, toolCalls, cardTypes, proposalStates, cards, caseFailure) {
  const reasons = caseFailure ? [caseFailure] : []
  for (const name of item.requiredTools ?? []) {
    if (!toolCalls.some(call => call.name === name)) reasons.push('required_tool_missing:' + name)
  }
  for (const name of item.forbiddenTools ?? []) {
    if (toolCalls.some(call => call.name === name)) reasons.push('forbidden_tool_called:' + name)
  }
  for (const type of item.expectedCards ?? []) {
    if (!cardTypes.includes(type)) reasons.push('expected_card_missing:' + type)
  }
  for (const expected of item.expectedInputs ?? []) {
    if (!toolCalls.some(call => compareExpectedInput(call, expected))) reasons.push('tool_arguments_mismatch:' + expected.tool)
  }
  if (item.expectedProposal) {
    const expectedStartsAt = new Date(item.expectedProposal.date + 'T' + item.expectedProposal.startTime + ':00+09:00').toISOString()
    const expectedEndsAt = new Date(item.expectedProposal.date + 'T' + item.expectedProposal.endTime + ':00+09:00').toISOString()
    if (!cards.some(card => card.type === 'proposal' && card.startsAt === expectedStartsAt && card.endsAt === expectedEndsAt)) reasons.push('proposal_time_mismatch')
  }
  if (item.requireFailedTool && !toolCalls.some(call => call.status === 'failed')) reasons.push('expected_tool_failure_missing')
  if (item.requirePendingProposal && !proposalStates.includes('pending')) reasons.push('pending_proposal_missing')
  if (item.forbidConfirmedProposal && proposalStates.includes('confirmed')) reasons.push('unexpected_confirmed_proposal')
  return [...new Set(reasons)]
}

async function promptVersion() {
  const promptFiles = ['src/lib/assistant-tools.ts', 'src/lib/assistant-chat.ts']
  const promptSource = await Promise.all(promptFiles.map(path => readFile(resolve(root, path), 'utf8')))
  return createHash('sha256').update(promptSource.join('\n')).digest('hex')
}

async function postTurn(context, turn, state) {
  const previousCards = state.cards
  const selectedCandidateId = turn.selectedCandidateIndex === undefined
    ? undefined
    : previousCards.find(card => card.type === 'availability')?.candidateIds?.[turn.selectedCandidateIndex]
  if (turn.selectedCandidateIndex !== undefined && !selectedCandidateId) return { failure: 'selected_candidate_missing', state }
  const body = {
    message: turn.message,
    conversationId: state.conversationId,
    version: state.version,
    requestId: randomUUID(),
    ...(selectedCandidateId ? { selectedCandidateId } : {})
  }
  const response = await context.post('/api/chat', { data: body })
  let payload = {}
  try {
    payload = await response.json()
  } catch {
    return { failure: 'invalid_api_response', state }
  }
  const calls = Array.isArray(payload.toolCalls) ? payload.toolCalls : []
  const cards = Array.isArray(payload.cards) ? payload.cards : []
  state.toolCalls.push(...calls)
  state.cards = cards
  state.allCards.push(...cards)
  state.cardTypes.push(...cards.flatMap(card => typeof card?.type === 'string' ? [card.type] : []))
  state.proposalStates.push(...cards.flatMap(card => card?.type === 'proposal' && typeof card.state === 'string' ? [card.state] : []))
  if (payload.model && !state.models.includes(payload.model)) state.models.push(payload.model)
  if (Number.isSafeInteger(payload.usage?.totalTokens)) state.totalTokens += payload.usage.totalTokens
  if (!response.ok) return { failure: 'http_' + response.status + (typeof payload.code === 'string' ? '_' + payload.code : ''), state }
  if (!state.conversationId && typeof payload.conversationId === 'string') state.conversationId = payload.conversationId
  if (Number.isSafeInteger(payload.version)) state.version = payload.version
  return { failure: null, state }
}

async function runCase(context, item) {
  const state = { conversationId: null, version: null, cards: [], allCards: [], cardTypes: [], proposalStates: [], toolCalls: [], models: [], totalTokens: 0 }
  let failure = null
  for (const turn of item.turns) {
    const result = await postTurn(context, turn, state)
    if (result.failure) {
      failure = result.failure
      break
    }
  }
  const sanitized = sanitizeAiEvaluationResult({ id: item.id, category: item.category, model: state.models.join(', ') || undefined, usage: { totalTokens: state.totalTokens }, toolCalls: state.toolCalls, cards: state.allCards })
  const reasons = assessCase(item, sanitized.toolCalls, sanitized.cardTypes, sanitized.proposalStates, state.allCards, failure)
  return { ...sanitized, passed: reasons.length === 0, failureReasons: reasons }
}

async function main() {
  if (!baseURL || !storageState || process.env.TEUMSAE_EVAL_ALLOW_DATABASE_WRITES !== 'YES') throw new Error('전용 테스트 DB에서 실행하고 TEUMSAE_EVAL_BASE_URL, TEUMSAE_EVAL_AUTH_STATE, TEUMSAE_EVAL_ALLOW_DATABASE_WRITES=YES를 설정하세요.')
  const cases = buildAiEvaluationCases()
  const validation = validateAiEvaluationCases(cases)
  if (!validation.ok) throw new Error('고정 평가 질문 구성이 잘못됐습니다: ' + validation.reason)
  const context = await request.newContext({ baseURL, storageState, extraHTTPHeaders: { Accept: 'application/json' } })
  const results = []
  try {
    for (const item of cases) {
      const result = await runCase(context, item)
      results.push(result)
      process.stdout.write((result.passed ? 'PASS ' : 'FAIL ') + result.id + (result.failureReasons.length ? ' · ' + result.failureReasons.join(', ') : '') + '\n')
    }
  } finally {
    await context.dispose()
  }
  const report = {
    source: 'live_authenticated_app',
    runAt: new Date().toISOString(),
    promptVersion: await promptVersion(),
    models: [...new Set(results.flatMap(result => result.model ? result.model.split(', ') : []))],
    total: cases.length,
    passed: results.filter(result => result.passed).length,
    failed: results.filter(result => !result.passed).length,
    results
  }
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
  process.stdout.write(`실제 AI 평가 ${report.passed}/${report.total} 통과 · 비식별 보고서 저장 완료\n`)
  process.stdout.write('보고서 경로: ' + outputPath + '\n')
  if (report.failed) process.exitCode = 1
}

main().catch(error => {
  process.stderr.write((error instanceof Error ? error.message : 'AI 평가를 실행하지 못했습니다.') + '\n')
  process.exitCode = 1
})
