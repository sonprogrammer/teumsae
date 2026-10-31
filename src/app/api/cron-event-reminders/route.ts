import { timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { createReminderNotification } from '@/lib/push-reminders.mjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ReminderDelivery = { delivery_id: string; event_id: string; subscription_id: string; owner_id: string; endpoint: string; p256dh: string; auth_key: string; starts_at: string; minutes_before: number }

function isAuthorized(request: Request) {
  const expected = process.env.CRON_SECRET
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!expected || !supplied) return false
  const expectedBytes = Buffer.from(expected)
  const suppliedBytes = Buffer.from(supplied)
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes)
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return Response.json({ message: '요청을 처리할 수 없어요.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!url || !serviceKey || !publicKey || !privateKey || !subject) return Response.json({ message: '알림 발송 설정이 준비되지 않았어요.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })

  const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  try { webpush.setVapidDetails(subject, publicKey, privateKey) } catch { return Response.json({ message: '알림 발송 설정이 올바르지 않아요.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }) }
  const { data, error } = await supabase.rpc('claim_event_reminder_deliveries')
  if (error) return Response.json({ message: '알림을 확인하지 못했어요.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })

  let sent = 0
  let failed = 0
  for (const delivery of (data ?? []) as ReminderDelivery[]) {
    const payload = createReminderNotification({ startsAt: delivery.starts_at, minutesBefore: delivery.minutes_before })
    let success = false
    let statusCode = 0
    let errorCode = 'invalid_reminder'
    if (payload) {
      try {
        await webpush.sendNotification({ endpoint: delivery.endpoint, keys: { p256dh: delivery.p256dh, auth: delivery.auth_key } }, JSON.stringify(payload), { TTL: 60 })
        success = true
        statusCode = 201
        errorCode = ''
      } catch (error) {
        const status = error && typeof error === 'object' ? (error as { statusCode?: unknown }).statusCode : null
        statusCode = typeof status === 'number' ? status : 0
        errorCode = statusCode === 404 || statusCode === 410 ? 'subscription_expired' : statusCode === 429 ? 'push_rate_limited' : statusCode >= 500 ? 'push_service_error' : 'push_delivery_failed'
      }
    }
    const { error: updateError } = await supabase.rpc('complete_event_reminder_delivery', { p_delivery_id: delivery.delivery_id, p_success: success, p_status_code: statusCode, p_error_code: errorCode })
    if (updateError) failed += 1
    else if (success) sent += 1
    else failed += 1
  }
  return Response.json({ processed: sent + failed, sent, failed }, { headers: { 'Cache-Control': 'no-store' } })
}
