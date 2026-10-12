-- =============================================================================
-- schema_update.sql: Instagram-Style Realtime Messaging Upgrade
-- =============================================================================

-- 1. Profiles presence tracking
alter table public.profiles
  add column if not exists last_seen timestamptz default now(),
  add column if not exists is_online boolean default false;

-- 2. Drop legacy constraint on message_type if it exists to allow rich media types
alter table public.messages drop constraint if exists messages_type_check;

-- 3. Upgrade messages schema
alter table public.messages
  add column if not exists reply_to_id uuid references public.messages (id) on delete set null,
  add column if not exists is_forwarded boolean not null default false,
  add column if not exists is_edited boolean not null default false,
  add column if not exists deleted_for_everyone boolean not null default false,
  add column if not exists media_type text not null default 'text',
  add column if not exists reactions jsonb not null default '{}'::jsonb;

-- 4. Constraint for media_type
alter table public.messages drop constraint if exists messages_media_type_check;
alter table public.messages
  add constraint messages_media_type_check
  check (media_type in ('text', 'image', 'video', 'audio', 'sticker', 'gif', 'voice'));

-- 5. Indexes
create index if not exists idx_messages_reply_to on public.messages (reply_to_id);
create index if not exists idx_messages_reactions on public.messages using gin (reactions);

-- 6. Update RLS policy to allow sender and receiver to update messages (for reactions, edits, seen status, soft delete)
drop policy if exists "messages_update" on public.messages;
create policy "messages_update"
  on public.messages for update to authenticated
  using (
    (select auth.uid()) = receiver_id
    or (select auth.uid()) = sender_id
  )
  with check (
    (select auth.uid()) = receiver_id
    or (select auth.uid()) = sender_id
  );
