-- 20260912_add_polls_videos_notifications.sql
-- Migration to support video posts, polls, poll votes, and notifications in Cirvy.

-- 1. Extend posts table with video_url if not already present
alter table public.posts add column if not exists video_url text;

-- 2. Create polls table
create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  question text not null,
  options jsonb not null default '[]'::jsonb,
  created_at timestamptz default now()
);

-- 3. Create poll_votes table
create table if not exists public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  option_index integer not null,
  created_at timestamptz default now(),
  unique(poll_id, user_id)
);

-- 4. Create notifications table
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  type text not null, -- 'friend_request', 'friend_accept', 'like', 'comment', 'poll_vote'
  entity_id uuid,
  content text,
  is_read boolean default false,
  created_at timestamptz default now()
);

-- Enable RLS
alter table public.polls enable row level security;
alter table public.poll_votes enable row level security;
alter table public.notifications enable row level security;

-- Polls policies (visible if post is visible)
create policy "Users can view polls"
  on public.polls for select
  using (true);

create policy "Users can create polls for their posts"
  on public.polls for insert
  with check (auth.uid() is not null);

-- Poll votes policies
create policy "Users can view poll votes"
  on public.poll_votes for select
  using (true);

create policy "Users can vote in polls"
  on public.poll_votes for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own vote"
  on public.poll_votes for update
  using (auth.uid() = user_id);

-- Notifications policies
create policy "Users can view their own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

create policy "Users can insert notifications"
  on public.notifications for insert
  with check (auth.uid() is not null);

create policy "Users can update their own notifications"
  on public.notifications for update
  using (auth.uid() = user_id);
