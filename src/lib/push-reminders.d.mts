export type ReminderSettings = { enabled: boolean; minutesBefore: number }
export type PushSubscriptionData = { endpoint: string; keys: { p256dh: string; auth: string } }
export type PushSupportState = { supported: boolean; reason: 'install' | 'unsupported' | null; missing: Array<'notification' | 'serviceWorker' | 'push'>; isIOS: boolean; isStandalone: boolean; hasNotification: boolean; hasServiceWorker: boolean; hasPushManager: boolean }
export function getPushSupportState(input: { isIOS: boolean; isStandalone: boolean; hasNotification: boolean; hasServiceWorker: boolean; hasPushManager: boolean }): PushSupportState
export function parseReminderSettings(value: unknown): { ok: true; value: ReminderSettings } | { ok: false }
export function parsePushSubscription(value: unknown): { ok: true; value: PushSubscriptionData } | { ok: false }
export function createReminderNotification(input: { startsAt: string; minutesBefore: number }): { title: string; body: string; url: string } | null
export function classifyPushDeliveryFailure(statusCode: number, responseBody?: string, vapidDiagnostic?: { failureCode: string } | null): 'subscription_expired' | 'push_rate_limited' | 'push_service_error' | 'vapid_token_rejected' | 'vapid_key_mismatch' | 'push_forbidden' | 'push_delivery_failed' | 'vapid_request_unreadable' | 'vapid_key_pair_mismatch' | 'vapid_request_key_mismatch' | 'vapid_subject_invalid' | 'vapid_audience_mismatch' | 'vapid_expiration_invalid' | 'apple_bad_jwt_unexplained'
