'use server'

import { eventMutationMessage, parseEventInput, type EventActionState, type EventRecordInput } from '@/lib/events'
import { createServerSupabaseClient } from '@/lib/supabase/server'

async function authenticatedClient() {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error || typeof data?.claims?.sub !== 'string') return null
  return supabase
}

function textValue(formData: FormData, name: string) {
  const value = formData.get(name)
  return typeof value === 'string' ? value : ''
}

function eventInput(formData: FormData, allowPast = false) {
  return parseEventInput({
    title: textValue(formData, 'title'),
    note: textValue(formData, 'note'),
    startsAt: textValue(formData, 'startsAt'),
    endsAt: textValue(formData, 'endsAt')
  }, new Date(), { allowPast })
}

function rpcInput(value: EventRecordInput) {
  return {
    p_title: value.title,
    p_note: value.note,
    p_starts_at: value.startsAt,
    p_ends_at: value.endsAt
  }
}

function invalidSession(): EventActionState {
  return { status: 'error', message: '로그인이 필요해요. 다시 로그인해 주세요.' }
}

function invalidEvent(field: 'title' | 'note' | 'startsAt' | 'endsAt', message: string): EventActionState {
  return { status: 'error', field, message }
}

function mutationFailure(code: string): EventActionState {
  return { status: 'error', message: eventMutationMessage(code) }
}

function validVersion(formData: FormData) {
  const value = Number(textValue(formData, 'version'))
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

export async function createEventAction(_previous: EventActionState, formData: FormData): Promise<EventActionState> {
  const supabase = await authenticatedClient()
  if (!supabase) return invalidSession()
  const parsed = eventInput(formData)
  if (!parsed.ok) return invalidEvent(parsed.field, parsed.message)
  const { error } = await supabase.rpc('create_event', rpcInput(parsed.value))
  if (error) return mutationFailure(error.code)
  return { status: 'success', message: '일정을 등록했어요.' }
}

export async function updateEventAction(_previous: EventActionState, formData: FormData): Promise<EventActionState> {
  const supabase = await authenticatedClient()
  if (!supabase) return invalidSession()
  const id = textValue(formData, 'id')
  const version = validVersion(formData)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) || version === null) {
    return { status: 'error', message: '일정 정보가 올바르지 않아요. 새로고침해 주세요.' }
  }
  const parsed = eventInput(formData, true)
  if (!parsed.ok) return invalidEvent(parsed.field, parsed.message)
  const { error } = await supabase.rpc('update_event', {
    p_event_id: id,
    p_expected_version: version,
    ...rpcInput(parsed.value)
  })
  if (error) return mutationFailure(error.code)
  return { status: 'success', message: '일정을 수정했어요.' }
}

export async function deleteEventAction(_previous: EventActionState, formData: FormData): Promise<EventActionState> {
  const supabase = await authenticatedClient()
  if (!supabase) return invalidSession()
  const id = textValue(formData, 'id')
  const version = validVersion(formData)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) || version === null) {
    return { status: 'error', message: '일정 정보가 올바르지 않아요. 새로고침해 주세요.' }
  }
  const { error } = await supabase.rpc('delete_event', { p_event_id: id, p_expected_version: version })
  if (error) return mutationFailure(error.code)
  return { status: 'success', message: '일정을 삭제했어요.' }
}
