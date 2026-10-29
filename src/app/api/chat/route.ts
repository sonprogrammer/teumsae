import { NextResponse } from 'next/server'
import { assistantSystemPrompt, assistantToolDefinitions, executeAssistantTool, type AssistantCard } from '@/lib/assistant-tools'
import { createToolLimitFallback, formatKoreaDateTime, getKoreaToday, parseAssistantRequest, parseToolArguments, parseToolName, summarizeAssistantToolInput, summarizeAssistantToolOutput, type AssistantToolCallLog } from '@/lib/assistant-chat'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
const privateHeaders = { 'Cache-Control': 'private, no-store' }
const modelUrl = 'https://api.groq.com/openai/v1/chat/completions'
const maxModelCalls = 5
const maxToolCalls = 5
const requestBudgetMs = 20000

type GroqMessage = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string | null; tool_calls?: unknown[]; tool_call_id?: string; name?: string }

function responseError(code: string, message: string, status: number, details: Record<string, unknown> = {}) {
  return NextResponse.json({ code, message, ...details }, { status, headers: privateHeaders })
}

function asMessages(value: unknown): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is { role: 'user' | 'assistant'; content: string } => Boolean(item) && typeof item === 'object' && ((item as Record<string, unknown>).role === 'user' || (item as Record<string, unknown>).role === 'assistant') && typeof (item as Record<string, unknown>).content === 'string').slice(-8)
}

function modelToolResult(card: AssistantCard) {
  if (card.type !== 'events') return card
  return {
    type: card.type,
    startDate: card.startDate,
    endDate: card.endDate,
    hasMore: card.hasMore,
    timezone: 'Asia/Seoul',
    events: card.events.map(event => {
      const start = formatKoreaDateTime(event.starts_at)
      const end = formatKoreaDateTime(event.ends_at)
      return { title: event.title, startDate: start?.date, startTime: start?.time, endDate: end?.date, endTime: end?.time }
    })
  }
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: authData, error: authError } = await supabase.auth.getClaims()
  const userId = authData?.claims?.sub
  if (authError || typeof userId !== 'string') return responseError('AUTH_REQUIRED', '로그인이 필요해요.', 401)
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return responseError('AI_NOT_CONFIGURED', 'AI 연결 설정이 아직 준비되지 않았어요. 서버 환경변수를 확인해 주세요.', 503)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return responseError('INVALID_REQUEST', '요청 내용을 확인해 주세요.', 400)
  }
  const parsed = parseAssistantRequest(body)
  if (!parsed.ok) return responseError('INVALID_REQUEST', parsed.message, 400)

  const { error: cleanupError } = await supabase.from('conversations').delete().eq('owner_id', userId).lt('expires_at', new Date().toISOString())
  if (cleanupError) return responseError('CONVERSATION_CLEANUP_FAILED', '만료된 대화를 정리하지 못했어요. 잠시 후 다시 시도해 주세요.', 500)

  const model = process.env.GROQ_MODEL || 'openai/gpt-oss-20b'
  const conversationId = parsed.value.conversationId ?? crypto.randomUUID()
  let version = 0
  let conversationMessages: Array<{ role: 'user' | 'assistant'; content: string }> = []
  let context: Record<string, unknown> = {}

  if (parsed.value.conversationId) {
    const { data: conversation, error } = await supabase.from('conversations').select('id, messages, context, version, expires_at').eq('id', conversationId).eq('owner_id', userId).maybeSingle()
    if (error) return responseError('CONVERSATION_LOOKUP_FAILED', '대화 정보를 불러오지 못했어요.', 500)
    if (!conversation) return responseError('CONVERSATION_NOT_FOUND', '대화를 찾을 수 없어요. 새 대화로 시작해 주세요.', 404)
    if (Date.parse(conversation.expires_at) <= Date.now()) return responseError('CONVERSATION_EXPIRED', '대화가 만료됐어요. 새 대화로 시작해 주세요.', 410)
    if (conversation.version !== parsed.value.version) return responseError('CONVERSATION_CONFLICT', '다른 요청에서 대화가 바뀌었어요. 최신 응답을 확인해 주세요.', 409)
    version = conversation.version
    conversationMessages = asMessages(conversation.messages)
    context = conversation.context && typeof conversation.context === 'object' && !Array.isArray(conversation.context) ? conversation.context as Record<string, unknown> : {}
  }

  const { data: withinUsageLimit, error: usageError } = await supabase.rpc('consume_ai_request')
  if (usageError) return responseError('AI_USAGE_CHECK_FAILED', 'AI 사용 한도를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.', 500)
  if (withinUsageLimit !== true) return responseError('AI_USAGE_LIMIT', '틈새 AI 사용 한도에 도달했어요. 분당·일일 이용 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.', 429)

  const contextTimestamp = typeof context.lastResultAt === 'string' ? Date.parse(context.lastResultAt) : typeof context.lastSearchAt === 'string' ? Date.parse(context.lastSearchAt) : null
  if (contextTimestamp !== null && Number.isFinite(contextTimestamp) && Date.now() - contextTimestamp > 10 * 60 * 1000) {
    context = { ...context, activeCandidates: [], lastDateRange: null, lastResult: null }
  }
  const now = new Date()
  const nowKorea = getKoreaToday(now)
  const modelMessages: GroqMessage[] = [
    { role: 'system', content: assistantSystemPrompt({ ...context, today: nowKorea }, now) },
    ...conversationMessages.map(message => ({ ...message })),
    { role: 'user', content: parsed.value.message }
  ]
  const cards: AssistantCard[] = []
  // 개발 검증용 호출 기록으로, 제목·메모·검색어 원문 없이 입력 조건과 결과 건수만 담고 대화 DB에는 저장하지 않는다.
  const toolLog: AssistantToolCallLog[] = []
  const diagnosticDetails = () => process.env.NODE_ENV === 'development' ? { toolCalls: toolLog } : {}
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), requestBudgetMs)
  let modelCalls = 0
  let totalTokens = 0
  let assistantText = ''
  let answerSource: 'model' | 'server_fallback' = 'model'
  let modelReturnedFinal = false
  let requestFailure: { code: string; message: string; status: number } | null = null

  try {
    while (modelCalls < maxModelCalls) {
      modelCalls += 1
      const response = await fetch(modelUrl, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: modelMessages, tools: assistantToolDefinitions, tool_choice: 'auto', max_completion_tokens: 1200 }),
        signal: controller.signal
      })
      if (!response.ok) {
        requestFailure = response.status === 429
          ? { code: 'MODEL_RATE_LIMIT', message: 'AI 서비스 요청 한도에 도달했어요. 잠시 후 다시 시도해 주세요.', status: 429 }
          : { code: 'MODEL_REQUEST_FAILED', message: 'AI 응답을 받지 못했어요. 잠시 후 다시 시도해 주세요.', status: 502 }
        break
      }
      const payload: unknown = await response.json()
      if (!payload || typeof payload !== 'object') {
        requestFailure = { code: 'MODEL_INVALID_RESPONSE', message: 'AI 응답 형식을 확인하지 못했어요.', status: 502 }
        break
      }
      const choice = (payload as Record<string, unknown>).choices
      const first = Array.isArray(choice) ? choice[0] : null
      const assistantMessage = first && typeof first === 'object' ? (first as Record<string, unknown>).message : null
      if (!assistantMessage || typeof assistantMessage !== 'object') {
        requestFailure = { code: 'MODEL_INVALID_RESPONSE', message: 'AI 응답 형식을 확인하지 못했어요.', status: 502 }
        break
      }
      const modelMessage = assistantMessage as Record<string, unknown>
      const usage = (payload as Record<string, unknown>).usage
      if (usage && typeof usage === 'object' && Number.isSafeInteger((usage as Record<string, unknown>).total_tokens)) totalTokens += Number((usage as Record<string, unknown>).total_tokens)
      const toolCalls = Array.isArray(modelMessage.tool_calls) ? modelMessage.tool_calls : []
      const content = typeof modelMessage.content === 'string' ? modelMessage.content : ''
      if (!toolCalls.length) {
        assistantText = content.trim()
        modelReturnedFinal = true
        break
      }
      modelMessages.push({ role: 'assistant', content: content || null, tool_calls: toolCalls })
      for (const call of toolCalls) {
        if (toolLog.length >= maxToolCalls) {
          requestFailure = { code: 'TOOL_CALL_LIMIT', message: '한 번에 실행할 수 있는 조회 횟수를 넘었어요. 요청을 나누어 주세요.', status: 429 }
          break
        }
        if (!call || typeof call !== 'object') {
          requestFailure = { code: 'MODEL_INVALID_TOOL_CALL', message: 'AI가 만든 조회 요청을 확인하지 못했어요.', status: 502 }
          break
        }
        const toolCall = call as Record<string, unknown>
        const fn = toolCall.function && typeof toolCall.function === 'object' ? toolCall.function as Record<string, unknown> : {}
        const name = parseToolName(fn.name)
        const args = parseToolArguments(fn.arguments)
        const callId = typeof toolCall.id === 'string' ? toolCall.id : ''
        if (!name || !args || !callId) {
          requestFailure = { code: 'MODEL_INVALID_TOOL_CALL', message: 'AI가 만든 조회 요청을 확인하지 못했어요.', status: 502 }
          break
        }
        const startedAt = Date.now()
        const result = await executeAssistantTool({ name, args, supabase, userId, context, signal: controller.signal })
        if (controller.signal.aborted) {
          requestFailure = { code: 'AI_TIMEOUT', message: 'AI 응답 시간이 길어져 요청을 마쳤어요. 다시 시도해 주세요.', status: 504 }
          break
        }
        toolLog.push({ name, status: result.ok ? 'success' : 'failed', durationMs: Date.now() - startedAt, input: summarizeAssistantToolInput(name, args), ...(result.ok ? { output: summarizeAssistantToolOutput(result.card) } : { errorCode: result.code }) })
        if (!result.ok) {
          if (result.fatal) {
            requestFailure = { code: result.code, message: result.message, status: result.code === 'EVENT_LIMIT_EXCEEDED' ? 422 : 500 }
            break
          }
          modelMessages.push({ role: 'tool', tool_call_id: callId, name, content: JSON.stringify({ error: result.code, message: result.message }) })
          continue
        }
        context = result.context
        cards.push(result.card)
        modelMessages.push({ role: 'tool', tool_call_id: callId, name, content: JSON.stringify(modelToolResult(result.card)) })
      }
      if (requestFailure) break
    }
    if (!requestFailure && !assistantText && !modelReturnedFinal && modelCalls >= maxModelCalls) {
      const fallback = createToolLimitFallback(cards.length, toolLog.map(tool => tool.status))
      if (fallback) {
        assistantText = fallback
        answerSource = 'server_fallback'
      }
    }
    if (!requestFailure && !assistantText) requestFailure = { code: 'MODEL_CALL_LIMIT', message: 'AI 응답이 복잡해 요청을 끝내지 못했어요. 조건을 나누어 다시 시도해 주세요.', status: 429 }
  } catch {
    requestFailure = controller.signal.aborted
      ? { code: 'AI_TIMEOUT', message: 'AI 응답 시간이 길어져 요청을 마쳤어요. 다시 시도해 주세요.', status: 504 }
      : { code: 'MODEL_UNAVAILABLE', message: 'AI 서비스에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.', status: 502 }
  } finally {
    clearTimeout(timer)
  }

  if (requestFailure) return responseError(requestFailure.code, requestFailure.message, requestFailure.status, { model, usage: { totalTokens }, ...diagnosticDetails(), cards })
  const nextMessages = [...conversationMessages, { role: 'user' as const, content: parsed.value.message }, { role: 'assistant' as const, content: assistantText }].slice(-8)
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const save = parsed.value.conversationId
    ? supabase.from('conversations').update({ messages: nextMessages, context, version: version + 1, expires_at: expiresAt, updated_at: new Date().toISOString() }).eq('id', conversationId).eq('owner_id', userId).eq('version', version).select('id').maybeSingle()
    : supabase.from('conversations').insert({ id: conversationId, owner_id: userId, messages: nextMessages, context, version: 1, expires_at: expiresAt }).select('id').single()
  const { data: saved, error: saveError } = await save
  if (saveError) return responseError('CONVERSATION_SAVE_FAILED', 'AI 답변은 받았지만 대화 상태를 저장하지 못했어요. 다시 시도해 주세요.', 500, { response: assistantText, model, usage: { totalTokens }, cards, ...diagnosticDetails() })
  if (!saved) return responseError('CONVERSATION_CONFLICT', '다른 요청에서 대화가 바뀌었어요. 최신 응답을 확인해 주세요.', 409, { response: assistantText, model, usage: { totalTokens }, cards, ...diagnosticDetails() })
  return NextResponse.json({ response: assistantText, answerSource, conversationId, version: version + 1, cards, ...diagnosticDetails(), model, usage: { totalTokens } }, { headers: privateHeaders })
}
