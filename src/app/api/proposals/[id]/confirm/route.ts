import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { persistProposalTranscriptState } from '@/lib/assistant-transcript-store'

const privateHeaders = { 'Cache-Control': 'private, no-store' }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function messageForStatus(status: string) {
  if (status === 'confirmed') return '일정을 등록했어요.'
  if (status === 'conflict') return '다른 일정이 먼저 등록되어 시간이 겹쳐요. 새 빈 시간을 찾아주세요.'
  if (status === 'stale') return '일정 가능 시간이 바뀌어 등록하지 않았어요. 빈 시간을 다시 찾아주세요.'
  if (status === 'expired') return '등록 확인이 만료됐어요. 빈 시간을 다시 찾아주세요.'
  if (status === 'cancelled') return '취소된 등록 제안이에요. 다시 일정을 제안해 주세요.'
  return '등록 제안을 확인할 수 없어요. 다시 시도해 주세요.'
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!uuidPattern.test(id)) return NextResponse.json({ status: 'invalid', message: '등록 제안 정보를 확인해 주세요.' }, { status: 400, headers: privateHeaders })
  const supabase = await createServerSupabaseClient()
  const { data: authData, error: authError } = await supabase.auth.getClaims()
  const userId = authData?.claims?.sub
  if (authError || typeof userId !== 'string') return NextResponse.json({ status: 'unauthenticated', message: '로그인이 필요해요.' }, { status: 401, headers: privateHeaders })
  const { data, error } = await supabase.rpc('confirm_event_proposal', { p_proposal_id: id })
  if (error) {
    const status = error.code === 'P0002' ? 404 : error.code === '42501' ? 401 : error.code === '22023' ? 400 : 500
    return NextResponse.json({ status: 'error', message: status === 404 ? '등록 제안을 찾을 수 없어요.' : status === 401 ? '로그인이 필요해요.' : '일정을 등록하지 못했어요. 잠시 후 다시 시도해 주세요.' }, { status, headers: privateHeaders })
  }
  const result = data && typeof data === 'object' ? data as Record<string, unknown> : {}
  const resultStatus = typeof result.status === 'string' ? result.status : 'error'
  const event = result.event && typeof result.event === 'object' ? result.event as Record<string, unknown> : null
  if (['confirmed', 'cancelled', 'expired', 'conflict', 'stale'].includes(resultStatus)) await persistProposalTranscriptState({ supabase, userId, proposalId: id, state: resultStatus as 'confirmed' | 'cancelled' | 'expired' | 'conflict' | 'stale', ...(typeof event?.id === 'string' ? { eventId: event.id } : {}) })
  const httpStatus = resultStatus === 'confirmed' ? 200 : resultStatus === 'expired' ? 410 : resultStatus === 'conflict' || resultStatus === 'stale' || resultStatus === 'cancelled' ? 409 : 500
  return NextResponse.json({ ...result, message: messageForStatus(resultStatus) }, { status: httpStatus, headers: privateHeaders })
}
