import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { persistProposalTranscriptState } from '@/lib/assistant-transcript-store'

const privateHeaders = { 'Cache-Control': 'private, no-store' }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!uuidPattern.test(id)) return NextResponse.json({ status: 'invalid', message: '등록 제안 정보를 확인해 주세요.' }, { status: 400, headers: privateHeaders })
  const supabase = await createServerSupabaseClient()
  const { data: authData, error: authError } = await supabase.auth.getClaims()
  const userId = authData?.claims?.sub
  if (authError || typeof userId !== 'string') return NextResponse.json({ status: 'unauthenticated', message: '로그인이 필요해요.' }, { status: 401, headers: privateHeaders })
  const { data, error } = await supabase.rpc('cancel_event_proposal', { p_proposal_id: id })
  if (error) {
    const status = error.code === 'P0002' ? 404 : error.code === '42501' ? 401 : error.code === '22023' ? 400 : 500
    return NextResponse.json({ status: 'error', message: status === 404 ? '등록 제안을 찾을 수 없어요.' : status === 401 ? '로그인이 필요해요.' : '등록 제안을 취소하지 못했어요. 잠시 후 다시 시도해 주세요.' }, { status, headers: privateHeaders })
  }
  const result = data && typeof data === 'object' ? data as Record<string, unknown> : {}
  const resultStatus = typeof result.status === 'string' ? result.status : 'error'
  if (['confirmed', 'cancelled', 'expired', 'conflict', 'stale'].includes(resultStatus)) await persistProposalTranscriptState({ supabase, userId, proposalId: id, state: resultStatus as 'confirmed' | 'cancelled' | 'expired' | 'conflict' | 'stale' })
  const httpStatus = resultStatus === 'cancelled' ? 200 : resultStatus === 'expired' ? 410 : resultStatus === 'confirmed' ? 409 : 500
  return NextResponse.json({ ...result, message: resultStatus === 'cancelled' ? '등록 제안을 취소했어요. 기존 일정은 변경하지 않았어요.' : resultStatus === 'expired' ? '등록 확인이 만료됐어요.' : resultStatus === 'confirmed' ? '이미 등록된 일정은 취소 버튼으로 삭제되지 않아요.' : '등록 제안을 취소하지 못했어요.' }, { status: httpStatus, headers: privateHeaders })
}
