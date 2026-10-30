import type { createServerSupabaseClient } from '@/lib/supabase/server'
import { parseAssistantTranscript, updateProposalState, type TranscriptProposalState } from '@/lib/assistant-transcript'

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

export async function persistProposalTranscriptState({ supabase, userId, proposalId, state, eventId }: { supabase: ServerSupabaseClient; userId: string; proposalId: string; state: TranscriptProposalState; eventId?: string }) {
  const { data, error } = await supabase.from('conversations').select('id, display_messages').eq('owner_id', userId).contains('display_messages', [{ cards: [{ id: proposalId }] }]).order('updated_at', { ascending: false }).limit(1).maybeSingle()
  if (error) return false
  if (!data) return true
  const messages = parseAssistantTranscript(data.display_messages)
  if (!messages.length) return false
  const updatedMessages = updateProposalState(messages, proposalId, state, eventId)
  const { error: updateError } = await supabase.from('conversations').update({ display_messages: updatedMessages }).eq('id', data.id).eq('owner_id', userId)
  return !updateError
}
