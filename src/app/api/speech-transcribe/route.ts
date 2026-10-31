import { NextResponse } from 'next/server'
import { parseTranscription, validateVoiceUpload } from '@/lib/voice-input.mjs'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const privateHeaders = { 'Cache-Control': 'private, no-store' }

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status, headers: privateHeaders })
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error || typeof data?.claims?.sub !== 'string') return errorResponse('AUTH_REQUIRED', '로그인이 필요해요.', 401)
  const contentLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > 21 * 1024 * 1024) return errorResponse('INVALID_AUDIO_SIZE', '녹음은 20MB 이하로 보내 주세요.', 413)

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return errorResponse('INVALID_AUDIO', '음성 파일을 읽지 못했어요.', 400)
  }
  const file = form.get('audio')
  if (!(file instanceof File)) return errorResponse('INVALID_AUDIO', '음성 녹음을 확인해 주세요.', 400)
  const validation = validateVoiceUpload({ size: file.size, type: file.type })
  if (!validation.ok) return errorResponse(validation.code, validation.code === 'INVALID_AUDIO_SIZE' ? '녹음은 20MB 이하로 보내 주세요.' : '지원하지 않는 녹음 형식이에요.', 400)

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return errorResponse('TRANSCRIPTION_NOT_CONFIGURED', '음성 인식 설정이 아직 준비되지 않았어요.', 503)
  const { data: withinUsageLimit, error: usageError } = await supabase.rpc('consume_speech_request')
  if (usageError) return errorResponse('AI_USAGE_CHECK_FAILED', 'AI 사용 한도를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.', 500)
  if (withinUsageLimit !== true) return errorResponse('AI_USAGE_LIMIT', '분당 음성 인식 한도를 초과했어요. 잠시 후 다시 시도해 주세요.', 429)
  const upstream = new FormData()
  upstream.append('file', file, file.name || 'voice.webm')
  upstream.append('model', 'whisper-large-v3-turbo')
  upstream.append('language', 'ko')
  upstream.append('response_format', 'json')
  let response: Response
  try {
    response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstream,
      signal: AbortSignal.timeout(15000)
    })
  } catch {
    return errorResponse('TRANSCRIPTION_UNAVAILABLE', '음성 인식 서버에 연결하지 못했어요. 다시 녹음해 주세요.', 502)
  }
  if (!response.ok) return errorResponse('TRANSCRIPTION_FAILED', '음성을 인식하지 못했어요. 다시 녹음해 주세요.', 502)
  const result: unknown = await response.json().catch(() => null)
  const text = result && typeof result === 'object' ? parseTranscription((result as Record<string, unknown>).text) : null
  if (!text) return errorResponse('TRANSCRIPTION_EMPTY', '음성에서 문장을 확인하지 못했어요. 다시 말해 주세요.', 422)
  return NextResponse.json({ text }, { headers: privateHeaders })
}
