'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'

type ReminderSettings = { enabled: boolean; minutesBefore: number; vapidPublicKey: string | null }
const leadTimes = [5, 10, 15, 30, 60]

function subscribePermissionChange(onChange: () => void) {
  window.addEventListener('focus', onChange)
  let status: PermissionStatus | null = null
  let active = true
  if (navigator.permissions) void navigator.permissions.query({ name: 'notifications' as PermissionName }).then(result => {
    if (!active) return
    status = result
    status.addEventListener('change', onChange)
  }).catch(() => undefined)
  return () => {
    active = false
    window.removeEventListener('focus', onChange)
    status?.removeEventListener('change', onChange)
  }
}

function browserPermission(): NotificationPermission | 'unsupported' {
  return typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
}

function applicationServerKey(value: string) {
  const padded = value + '='.repeat((4 - value.length % 4) % 4)
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

export default function PushReminderSettings({ userId }: { userId: string }) {
  const [settings, setSettings] = useState<ReminderSettings | null>(null)
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)
  const browserPermissionValue = useSyncExternalStore(subscribePermissionChange, browserPermission, () => 'unsupported')
  const [permissionOverride, setPermissionOverride] = useState<NotificationPermission | null>(null)
  const permission = permissionOverride ?? browserPermissionValue
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch('/api/push-preferences', { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error('알림 설정을 불러오지 못했어요.')
      const next = await response.json() as ReminderSettings
      if (!cancelled) setSettings(next)
    }).catch(error => { if (!cancelled) setMessage(error instanceof Error ? error.message : '알림 설정을 불러오지 못했어요.') })
    if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistration().then(registration => registration?.pushManager.getSubscription() ?? null).then(current => { if (!cancelled) setSubscription(current) }).catch(() => undefined)
    return () => { cancelled = true }
  }, [userId])

  async function savePreferences(next: ReminderSettings) {
    const response = await fetch('/api/push-preferences', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: next.enabled, minutesBefore: next.minutesBefore }) })
    if (!response.ok) {
      const result = await response.json().catch(() => ({})) as { message?: string }
      throw new Error(result.message || '알림 설정을 저장하지 못했어요.')
    }
    setSettings(next)
  }

  async function enableReminders() {
    if (!settings || pending) return
    setPending(true)
    setMessage('')
    try {
      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('이 브라우저에서는 푸시 알림을 지원하지 않아요.')
      if (!settings.vapidPublicKey) throw new Error('푸시 알림 서버 설정이 아직 준비되지 않았어요.')
      const nextPermission = await Notification.requestPermission()
      setPermissionOverride(nextPermission)
      if (nextPermission !== 'granted') throw new Error(nextPermission === 'denied' ? '브라우저 설정에서 틈새 알림을 허용해 주세요.' : '알림 권한이 필요해요.')
      const registration = await navigator.serviceWorker.getRegistration()
      if (!registration) throw new Error('앱을 설치하거나 페이지를 새로고침한 뒤 다시 시도해 주세요.')
      const nextSubscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(settings.vapidPublicKey) })
      const response = await fetch('/api/push-subscriptions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nextSubscription.toJSON()) })
      if (!response.ok) throw new Error('이 기기를 알림 목록에 등록하지 못했어요.')
      await savePreferences({ ...settings, enabled: true })
      setSubscription(nextSubscription)
      setMessage('일정 시작 ' + settings.minutesBefore + '분 전에 이 기기로 알림을 보내드릴게요.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '알림을 설정하지 못했어요.')
    } finally {
      setPending(false)
    }
  }

  async function disableReminders() {
    if (!settings || pending) return
    setPending(true)
    setMessage('')
    try {
      await savePreferences({ ...settings, enabled: false })
      if (subscription) {
        await fetch('/api/push-subscriptions', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: subscription.endpoint }) })
        await subscription.unsubscribe()
        setSubscription(null)
      }
      setMessage('이 기기의 일정 알림을 껐어요.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '알림을 해제하지 못했어요.')
    } finally {
      setPending(false)
    }
  }

  async function changeLeadTime(value: string) {
    if (!settings || !leadTimes.includes(Number(value)) || pending) return
    setPending(true)
    setMessage('')
    try {
      await savePreferences({ ...settings, minutesBefore: Number(value) })
      if (settings.enabled) setMessage('알림 시점을 변경했어요.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '알림 시점을 저장하지 못했어요.')
    } finally {
      setPending(false)
    }
  }

  const supported = typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window
  return <section className="push-reminder-card" aria-labelledby="push-reminder-heading">
    <div className="push-reminder-copy"><p className="section-kicker">REMINDERS</p><h2 id="push-reminder-heading">일정 알림</h2><p>선택한 일정이 시작되기 전에 이 기기로 푸시 알림을 보내드려요.</p></div>
    {!supported ? <p className="push-reminder-status" role="status">이 브라우저에서는 푸시 알림을 지원하지 않아요.</p> : settings ? <>
      <label className="push-reminder-lead-time">알림 시점<select value={settings.minutesBefore} onChange={event => void changeLeadTime(event.target.value)} disabled={pending}><option value={5}>5분 전</option><option value={10}>10분 전</option><option value={15}>15분 전</option><option value={30}>30분 전</option><option value={60}>1시간 전</option></select></label>
      <p className="push-reminder-permission">브라우저 권한: {permission === 'granted' ? '허용됨' : permission === 'denied' ? '차단됨 · 브라우저 설정에서 변경' : '아직 선택하지 않음'}</p>
      <div className="push-reminder-actions">{settings.enabled ? <button type="button" className="real-secondary-button" onClick={() => void disableReminders()} disabled={pending}>{pending ? '저장 중…' : '알림 끄기'}</button> : <button type="button" className="real-primary-button" onClick={() => void enableReminders()} disabled={pending}>{pending ? '설정 중…' : '일정 알림 켜기'}</button>}</div>
    </> : <p className="push-reminder-status" role="status">알림 설정을 불러오는 중…</p>}
    {settings?.enabled && <p className="push-reminder-status" role="status">알림이 켜져 있어요. 시작 {settings.minutesBefore}분 전으로 설정되어 있습니다.</p>}
    {message && <p className="push-reminder-message" role="status">{message}</p>}
  </section>
}
