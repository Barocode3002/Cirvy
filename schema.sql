-- Cirvy canonical schema (consolidated)
-- Replaces fragmented delta scripts: db.sql, Messaging.sql, Notifications.sql,
-- PollSupportInPosts.sql, loginWithRateLimiter.sql, ChatEncryption.sql,
-- RealtimeSetup.sql, NotificationRealtime.sql, PostsArchive.sql
--
-- Safe to re-run on an existing project (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- App source of truth for polls: public.polls (jsonb options) + public.poll_votes
-- (poll_id, option_index) — not poll_options embeds.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  display_name text,
  avatar_url text,
  bio text,
  onboarded boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint friendships_status_check
    check (status in ('pending', 'accepted', 'rejected')),
  constraint friendships_not_self_check
    check (requester_id <> addressee_id)
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  content text,
  image_url text,
  video_url text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.user_keys (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  public_key text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  receiver_id uuid not null references public.profiles (id) on delete cascade,
  ciphertext text not null,
  iv text not null,
  is_read boolean not null default false,
  message_type text not null default 'text',
  mime_type text,
  created_at timestamptz not null default now(),
  constraint messages_type_check
    check (message_type in ('text', 'voice'))
);

create table if not exists public.login_attempts (
  email text primary key,
  failed_count integer not null default 0,
  locked_until timestamptz
);

create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  question text not null,
  options jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  option_index integer not null,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  entity_id uuid,
  content text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- Additive columns for databases created from older db.sql
alter table public.profiles add column if not exists onboarded boolean not null default false;
alter table public.posts add column if not exists video_url text;
alter table public.posts add column if not exists is_archived boolean not null default false;
alter table public.messages add column if not exists message_type text not null default 'text';
alter table public.messages add column if not exists mime_type text;
alter table public.messages add column if not exists is_read boolean not null default false;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create unique index if not exists profiles_username_lower_uidx
  on public.profiles (lower(username));

create index if not exists friendships_requester_id_idx
  on public.friendships (requester_id);

create index if not exists friendships_addressee_id_idx
  on public.friendships (addressee_id);

create unique index if not exists friendships_pair_uidx
  on public.friendships (
    least(requester_id, addressee_id),
    greatest(requester_id, addressee_id)
  );

create index if not exists posts_author_id_idx on public.posts (author_id);
create index if not exists posts_created_at_idx on public.posts (created_at desc);

create index if not exists likes_post_id_idx on public.likes (post_id);
create index if not exists likes_user_id_idx on public.likes (user_id);
create unique index if not exists likes_post_user_uidx on public.likes (post_id, user_id);

create index if not exists comments_post_id_idx on public.comments (post_id);
create index if not exists comments_user_id_idx on public.comments (user_id);

create index if not exists messages_sender_id_idx on public.messages (sender_id);
create index if not exists messages_receiver_id_idx on public.messages (receiver_id);
create index if not exists messages_created_at_idx on public.messages (created_at desc);
create index if not exists idx_messages_type on public.messages (message_type);

create index if not exists polls_post_id_idx on public.polls (post_id);

create index if not exists poll_votes_poll_id_idx on public.poll_votes (poll_id);
create unique index if not exists poll_votes_poll_user_uidx
  on public.poll_votes (poll_id, user_id);

create index if not exists notifications_user_id_idx on public.notifications (user_id);
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id)
  where is_read = false;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

create or replace function public.are_friends(user_a uuid, user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.friendships
    where status = 'accepted'
      and (
        (requester_id = user_a and addressee_id = user_b)
        or (requester_id = user_b and addressee_id = user_a)
      )
  );
$$;

create or replace function public.check_login_lock(p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.login_attempts%rowtype;
begin
  select * into rec
  from public.login_attempts
  where email = lower(trim(p_email));

  if not found then
    return false;
  end if;

  if rec.locked_until is not null and rec.locked_until > now() then
    return true;
  end if;

  return false;
end;
$$;

create or replace function public.record_login_attempt(p_email text, p_success boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.login_attempts%rowtype;
  normalized text := lower(trim(p_email));
  next_count integer;
begin
  if p_success then
    delete from public.login_attempts where email = normalized;
    return;
  end if;

  insert into public.login_attempts (email, failed_count, locked_until)
  values (normalized, 1, null)
  on conflict (email) do update
    set failed_count = public.login_attempts.failed_count + 1
  returning * into rec;

  next_count := rec.failed_count;

  update public.login_attempts
  set locked_until = case
    when next_count >= 7 then now() + interval '1 hour'
    when next_count >= 5 then now() + interval '15 minutes'
    else locked_until
  end
  where email = normalized;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name, avatar_url, onboarded)
  values (
    new.id,
    lower(
      coalesce(
        new.raw_user_meta_data ->> 'username',
        new.raw_user_meta_data ->> 'preferred_username',
        split_part(coalesce(new.email, ''), '@', 1),
        left(new.id::text, 8)
      )
    ),
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      'Cirvy User'
    ),
    coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture'
    ),
    false
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.are_friends(uuid, uuid) to authenticated;
grant execute on function public.check_login_lock(text) to anon, authenticated;
grant execute on function public.record_login_attempt(text, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.posts enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;
alter table public.user_keys enable row level security;
alter table public.messages enable row level security;
alter table public.login_attempts enable row level security;
alter table public.polls enable row level security;
alter table public.poll_votes enable row level security;
alter table public.notifications enable row level security;

-- login_attempts: RPC only (no direct table policies)

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select"
  on public.profiles for select to authenticated
  using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "friendships_select" on public.friendships;
create policy "friendships_select"
  on public.friendships for select to authenticated
  using (
    (select auth.uid()) = requester_id
    or (select auth.uid()) = addressee_id
  );

drop policy if exists "friendships_insert" on public.friendships;
create policy "friendships_insert"
  on public.friendships for insert to authenticated
  with check ((select auth.uid()) = requester_id);

drop policy if exists "friendships_update" on public.friendships;
create policy "friendships_update"
  on public.friendships for update to authenticated
  using (
    (select auth.uid()) = requester_id
    or (select auth.uid()) = addressee_id
  )
  with check (
    (select auth.uid()) = requester_id
    or (select auth.uid()) = addressee_id
  );

drop policy if exists "friendships_delete" on public.friendships;
create policy "friendships_delete"
  on public.friendships for delete to authenticated
  using (
    (select auth.uid()) = requester_id
    or (select auth.uid()) = addressee_id
  );

drop policy if exists "posts_select" on public.posts;
create policy "posts_select"
  on public.posts for select to authenticated
  using (
    (select auth.uid()) = author_id
    or public.are_friends((select auth.uid()), author_id)
  );

drop policy if exists "posts_insert" on public.posts;
create policy "posts_insert"
  on public.posts for insert to authenticated
  with check ((select auth.uid()) = author_id);

drop policy if exists "posts_update" on public.posts;
create policy "posts_update"
  on public.posts for update to authenticated
  using ((select auth.uid()) = author_id)
  with check ((select auth.uid()) = author_id);

drop policy if exists "posts_delete" on public.posts;
create policy "posts_delete"
  on public.posts for delete to authenticated
  using ((select auth.uid()) = author_id);

drop policy if exists "likes_select" on public.likes;
create policy "likes_select"
  on public.likes for select to authenticated
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_id
        and (
          p.author_id = (select auth.uid())
          or public.are_friends((select auth.uid()), p.author_id)
        )
    )
  );

drop policy if exists "likes_insert" on public.likes;
create policy "likes_insert"
  on public.likes for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "likes_delete" on public.likes;
create policy "likes_delete"
  on public.likes for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "comments_select" on public.comments;
create policy "comments_select"
  on public.comments for select to authenticated
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_id
        and (
          p.author_id = (select auth.uid())
          or public.are_friends((select auth.uid()), p.author_id)
        )
    )
  );

drop policy if exists "comments_insert" on public.comments;
create policy "comments_insert"
  on public.comments for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "comments_delete" on public.comments;
create policy "comments_delete"
  on public.comments for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "user_keys_select" on public.user_keys;
create policy "user_keys_select"
  on public.user_keys for select to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists "user_keys_insert" on public.user_keys;
create policy "user_keys_insert"
  on public.user_keys for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "user_keys_update" on public.user_keys;
create policy "user_keys_update"
  on public.user_keys for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "messages_select" on public.messages;
create policy "messages_select"
  on public.messages for select to authenticated
  using (
    (
      (select auth.uid()) = sender_id
      or (select auth.uid()) = receiver_id
    )
    and public.are_friends(sender_id, receiver_id)
  );

drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert"
  on public.messages for insert to authenticated
  with check (
    (select auth.uid()) = sender_id
    and public.are_friends(sender_id, receiver_id)
  );

drop policy if exists "messages_update" on public.messages;
create policy "messages_update"
  on public.messages for update to authenticated
  using ((select auth.uid()) = receiver_id)
  with check ((select auth.uid()) = receiver_id);

drop policy if exists "polls_select" on public.polls;
create policy "polls_select"
  on public.polls for select to authenticated
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_id
        and (
          p.author_id = (select auth.uid())
          or public.are_friends((select auth.uid()), p.author_id)
        )
    )
  );

drop policy if exists "polls_insert" on public.polls;
create policy "polls_insert"
  on public.polls for insert to authenticated
  with check (
    exists (
      select 1 from public.posts p
      where p.id = post_id
        and p.author_id = (select auth.uid())
    )
  );

drop policy if exists "poll_votes_select" on public.poll_votes;
create policy "poll_votes_select"
  on public.poll_votes for select to authenticated
  using (
    exists (
      select 1
      from public.polls po
      join public.posts p on p.id = po.post_id
      where po.id = poll_id
        and (
          p.author_id = (select auth.uid())
          or public.are_friends((select auth.uid()), p.author_id)
        )
    )
  );

drop policy if exists "poll_votes_insert" on public.poll_votes;
create policy "poll_votes_insert"
  on public.poll_votes for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "poll_votes_update" on public.poll_votes;
create policy "poll_votes_update"
  on public.poll_votes for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "notifications_select" on public.notifications;
create policy "notifications_select"
  on public.notifications for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "notifications_insert" on public.notifications;
create policy "notifications_insert"
  on public.notifications for insert to authenticated
  with check ((select auth.uid()) is not null);

drop policy if exists "notifications_update" on public.notifications;
create policy "notifications_update"
  on public.notifications for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Grants (Data API)
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.friendships to authenticated;
grant select, insert, update, delete on public.posts to authenticated;
grant select, insert, delete on public.likes to authenticated;
grant select, insert, delete on public.comments to authenticated;
grant select, insert, update on public.user_keys to authenticated;
grant select, insert, update on public.messages to authenticated;
grant select, insert on public.polls to authenticated;
grant select, insert, update on public.poll_votes to authenticated;
grant select, insert, update on public.notifications to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

alter table public.messages replica identity full;
alter table public.notifications replica identity full;
alter table public.user_keys replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_keys'
  ) then
    alter publication supabase_realtime add table public.user_keys;
  end if;
end $$;
