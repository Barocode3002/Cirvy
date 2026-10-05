-- 20261005_add_voice_messages.sql
-- Add message_type and mime_type columns to support E2EE voice messages.
-- message_type: 'text' (default) | 'voice'
-- mime_type: e.g. 'audio/webm;codecs=opus' — stored so receiver knows how to decode

alter table public.messages
  add column if not exists message_type text not null default 'text',
  add column if not exists mime_type text;

-- Index for fast type-based filtering (optional, future-proofing)
create index if not exists idx_messages_type on public.messages (message_type);
