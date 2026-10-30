import assert from 'node:assert/strict'
import test from 'node:test'
import { parseEventCandidates, parsePrepareEventArguments, resolveEventProposal, resolveProposalMutation } from './event-proposals.ts'

const candidateId = '10000000-0000-4000-8000-000000000001'
const searchId = '20000000-0000-4000-8000-000000000002'
const candidate = { id: candidateId, searchId, date: '2026-11-02', start: '10:00', end: '11:00', expiresAt: '2026-11-02T00:10:00.000Z', settingsVersion: 3 }

test('parses candidate proposals without accepting model-provided times', () => {
  assert.deepEqual(parsePrepareEventArguments({ title: '운동', searchId, candidateId }), { ok: true, value: { title: '운동', note: null, searchId, candidateId } })
  assert.equal(parsePrepareEventArguments({ title: '운동', searchId, candidateId, startsAt: '2026-11-02T10:00:00+09:00' }).ok, false)
})

test('parses valid directly specified Korea date and times', () => {
  assert.deepEqual(parsePrepareEventArguments({ title: '운동', date: '2026-11-02', startTime: '10:00', endTime: '11:00' }), { ok: true, value: { title: '운동', note: null, date: '2026-11-02', startTime: '10:00', endTime: '11:00' } })
  assert.equal(parsePrepareEventArguments({ title: ' ', date: '2026-11-02', startTime: '10:00', endTime: '11:00' }).ok, false)
  assert.equal(parsePrepareEventArguments({ title: '운동', date: '2026-02-30', startTime: '10:00', endTime: '11:00' }).ok, false)
  assert.equal(parsePrepareEventArguments({ title: '운동', date: '2026-11-02', startTime: '10:05', endTime: '11:00' }).ok, false)
})

test('resolves a selected candidate from server context and captures its settings version', () => {
  const parsed = parsePrepareEventArguments({ title: '운동', searchId, candidateId })
  assert.equal(parsed.ok, true)
  assert.deepEqual(resolveEventProposal(parsed.value, [candidate], 3, new Date('2026-11-01T00:00:00.000Z')), {
    ok: true,
    value: { title: '운동', note: null, startsAt: '2026-11-02T01:00:00.000Z', endsAt: '2026-11-02T02:00:00.000Z', settingsVersion: 3, candidateId, searchId }
  })
})

test('parses persisted candidate IDs and ignores malformed or incomplete context entries', () => {
  assert.deepEqual(parseEventCandidates([candidate, { ...candidate, id: 'spoofed' }, null]), [candidate])
})

test('rejects missing, expired and stale candidates instead of trusting stale model context', () => {
  const parsed = parsePrepareEventArguments({ title: '운동', searchId, candidateId })
  assert.equal(resolveEventProposal(parsed.value, [], 3, new Date('2026-11-01T00:00:00.000Z')).ok, false)
  assert.equal(resolveEventProposal(parsed.value, [candidate], 4, new Date('2026-11-01T00:00:00.000Z')).ok, false)
  assert.equal(resolveEventProposal(parsed.value, [{ ...candidate, expiresAt: '2026-10-31T23:59:59.000Z' }], 3, new Date('2026-11-01T00:00:00.000Z')).ok, false)
})

test('resolves a directly specified event in Asia/Seoul and rejects expired times', () => {
  const parsed = parsePrepareEventArguments({ title: '운동', date: '2026-11-02', startTime: '10:00', endTime: '11:00' })
  assert.equal(parsed.ok, true)
  const result = resolveEventProposal(parsed.value, [], 3, new Date('2026-11-01T00:00:00.000Z'))
  assert.equal(result.ok, true)
  assert.equal(result.value.startsAt, '2026-11-02T01:00:00.000Z')
  assert.equal(resolveEventProposal(parsed.value, [], 3, new Date('2026-11-02T02:00:00.000Z')).ok, false)
})

test('only a confirmed server result marks a proposal as saved', () => {
  assert.deepEqual(resolveProposalMutation({ status: 'confirmed', event: { id: 'event-1' }, message: '일정을 등록했어요.' }, 'confirm'), { ok: true, state: 'confirmed', eventId: 'event-1', message: '일정을 등록했어요.' })
  assert.deepEqual(resolveProposalMutation({ status: 'conflict', message: '시간이 겹쳐요.' }, 'confirm'), { ok: false, state: 'conflict', message: '시간이 겹쳐요.' })
})

test('only a cancelled server result completes proposal cancellation', () => {
  assert.deepEqual(resolveProposalMutation({ status: 'cancelled' }, 'cancel'), { ok: true, state: 'cancelled', message: '등록 제안을 취소했어요.' })
})
