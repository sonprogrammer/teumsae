export const maxVoiceUploadBytes: number
export const allowedVoiceMimeTypes: Set<string>
export function validateVoiceUpload(input: { size: number; type: string }): { ok: true } | { ok: false; code: string }
export function parseTranscription(value: unknown): string | null
export function speechText(value: string): string
