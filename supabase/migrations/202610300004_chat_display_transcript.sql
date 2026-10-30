alter table public.conversations
  add column display_messages jsonb not null default '[]'::jsonb;

alter table public.conversations
  add constraint conversations_display_messages_array
  check (jsonb_typeof(display_messages) = 'array');
