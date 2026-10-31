export const maxVoiceUploadBytes: number
export const voiceSilenceDurationMs: number
export const voiceActivityThreshold: number
export const allowedVoiceMimeTypes: Set<string>
export function resolveVoiceActivity(input: { rms: number; hasSpeech: boolean; lastSpeechAt: number | null; now: number }): { hasSpeech: boolean; lastSpeechAt: number | null; shouldSubmit: boolean }
export function validateVoiceUpload(input: { size: number; type: string }): { ok: true } | { ok: false; code: string }
export function parseTranscription(value: unknown): string | null
export function speechText(value: string): string
export function speechResponse(value: string, cards?: unknown[]): string
