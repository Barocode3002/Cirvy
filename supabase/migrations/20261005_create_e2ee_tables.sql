-- 20261005_create_e2ee_tables.sql
-- Create user_keys and messages tables for Cirvy E2EE 1-to-1 messaging

-- 1. Create user_keys table
create table if not exists public.user_keys (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  public_key text not null,
  created_at timestamptz default now()
);

-- Enable RLS on user_keys
alter table public.user_keys enable row level security;

-- Policies for user_keys
create policy "Authenticated users can view public keys"
  on public.user_keys for select
  using (auth.uid() is not null);

create policy "Users can insert their own public key"
  on public.user_keys for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own public key"
  on public.user_keys for update
  using (auth.uid() = user_id);

-- 2. Create messages table
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  ciphertext text not null,
  iv text not null,
  is_read boolean default false,
  created_at timestamptz default now()
);

-- Enable RLS on messages
alter table public.messages enable row level security;

-- Policies for messages (friends only via are_friends)
create policy "Users can view their own messages"
  on public.messages for select
  using (
    (auth.uid() = sender_id or auth.uid() = receiver_id)
    and public.are_friends(sender_id, receiver_id)
  );

create policy "Users can send messages to accepted friends"
  on public.messages for insert
  with check (
    auth.uid() = sender_id
    and public.are_friends(sender_id, receiver_id)
  );

create policy "Receivers can update message read status"
  on public.messages for update
  using (auth.uid() = receiver_id);

-- Enable realtime for messages
alter publication supabase_realtime add table public.messages;
