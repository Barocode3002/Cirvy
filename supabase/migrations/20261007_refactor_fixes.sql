-- Migration: 20261007_refactor_fixes.sql
-- Fixes for RLS and atomic transactions

-- 1. Ensure posts RLS policies are explicit and strict about archiving
-- Note: schema.sql already has update/delete policies for owner.
-- We refine the select policy to exclude archived posts unless you are the owner.

drop policy if exists "posts_select" on public.posts;
create policy "posts_select"
  on public.posts for select to authenticated
  using (
    (
      (select auth.uid()) = author_id
      or public.are_friends((select auth.uid()), author_id)
    )
    and (is_archived = false or author_id = (select auth.uid()))
  );

-- 2. Atomic Poll Creation RPC
create or replace function public.create_poll_post(
  p_author_id uuid,
  p_content text,
  p_question text,
  p_options jsonb,
  p_image_url text default null,
  p_video_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post_id uuid;
begin
  -- Insert the post first
  insert into public.posts (author_id, content, image_url, video_url, is_archived)
  values (p_author_id, p_content, p_image_url, p_video_url, false)
  returning id into v_post_id;

  -- Insert the poll associated with the post
  insert into public.polls (post_id, question, options)
  values (v_post_id, p_question, p_options);

  return v_post_id;
exception
  when others then
    -- PL/pgSQL functions are atomic; they rollback on exception by default.
    raise;
end;
$$;

grant execute on function public.create_poll_post(uuid, text, text, jsonb, text, text) to authenticated;
