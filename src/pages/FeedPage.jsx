// src/pages/FeedPage.jsx
// Friends-only Feed view — friends posts + create box at top.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShieldCheck, Users, Sparkles, Bell, MessageSquare, Plus } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useUI } from '@/contexts/UIContext'
import { supabase } from '@/lib/supabase'
import PostCard from '@/components/PostCard'
import CreatePostBox from '@/components/CreatePostBox'
import AppShell from '@/components/AppShell'
import CirvyLogo from '@/components/CirvyLogo'

export default function FeedPage() {
  const { user } = useAuth()
  const { showToast } = useUI()

  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPosts()
  }, [user])

  async function loadPosts() {
    if (!user) return
    setLoading(true)

    // Fetch accepted friend IDs
    const { data: friendships } = await supabase
      .from('friendships')
      .select('requester_id, addressee_id')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .eq('status', 'accepted')

    const friendIds = (friendships || []).map((f) =>
      f.requester_id === user.id ? f.addressee_id : f.requester_id
    )

    // Include the user's own posts
    const authorIds = Array.from(new Set([user.id, ...friendIds]))

    // 1. Fetch posts
    let rawPosts = []
    try {
      const { data: pData, error: pErr } = await supabase
        .from('posts')
        .select('id, content, image_url, video_url, author_id, created_at')
        .in('author_id', authorIds)
        .order('created_at', { ascending: false })
        .limit(50)

      if (pErr) {
        // Fallback without video_url if column does not exist
        const { data: fallbackPosts } = await supabase
          .from('posts')
          .select('id, content, image_url, author_id, created_at')
          .in('author_id', authorIds)
          .order('created_at', { ascending: false })
          .limit(50)
        rawPosts = fallbackPosts || []
      } else {
        rawPosts = pData || []
      }
    } catch {
      rawPosts = []
    }

    if (!rawPosts.length) {
      setPosts([])
      setLoading(false)
      return
    }

    // 2. Fetch author profiles
    const distinctAuthorIds = Array.from(new Set(rawPosts.map((p) => p.author_id)))
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', distinctAuthorIds)

    const profilesMap = new Map((profilesData || []).map((p) => [p.id, p]))

    // 3. Batch fetch polls for these posts
    const postIds = rawPosts.map((p) => p.id)
    let pollsMap = new Map()
    try {
      const { data: pollsData } = await supabase
        .from('polls')
        .select('id, post_id, question, options')
        .in('post_id', postIds)

      if (pollsData) {
        pollsMap = new Map(pollsData.map((pol) => [pol.post_id, pol]))
      }
    } catch {
      // Graceful fallback if polls table query fails
    }

    // Merge into complete post objects
    const enriched = rawPosts.map((p) => ({
      ...p,
      author: profilesMap.get(p.author_id) || {
        id: p.author_id,
        display_name: 'Cirvy Friend',
        username: 'friend',
      },
      poll: pollsMap.get(p.id) || null,
    }))

    setPosts(enriched)
    setLoading(false)
  }

  async function handleCreatePost({ content, imageUrl, videoUrl, poll }) {
    if (!user) return false
    try {
      const { data: postData, error: postError } = await supabase
        .from('posts')
        .insert({
          author_id: user.id,
          content: content || '',
          image_url: imageUrl || null,
          video_url: videoUrl || null,
        })
        .select('id')
        .single()

      if (postError) {
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('posts')
          .insert({ author_id: user.id, content: content || '', image_url: imageUrl || videoUrl || null })
          .select('id')
          .single()
        if (fallbackError) return false
        if (poll && fallbackData?.id) {
          try { await supabase.from('polls').insert({ post_id: fallbackData.id, question: poll.question, options: poll.options }) } catch { /* ignore */ }
        }
        await loadPosts()
        return true
      }

      if (poll && postData?.id) {
        try { await supabase.from('polls').insert({ post_id: postData.id, question: poll.question, options: poll.options }) } catch { /* ignore */ }
      }

      await loadPosts()
      return true
    } catch {
      return false
    }
  }

  return (
    <AppShell rightSidebar>
      <main className="min-w-0 py-1 sm:py-2 max-w-xl mx-auto space-y-5">
        {/* Mobile Mockup Header: Cirvy wordmark + Bell & Chat icons */}
        <header className="flex items-center justify-between px-1 py-1 md:hidden">
          <Link to="/feed" className="flex items-center gap-2 group">
            <CirvyLogo variant="full" size={28} />
          </Link>
          <div className="flex items-center gap-2">
            <Link
              to="/notifications"
              className="w-9 h-9 flex items-center justify-center text-[var(--text-main)] hover:text-[var(--accent)] scale-tap transition cursor-pointer"
              aria-label="Activity"
            >
              <Bell size={22} />
            </Link>
            <Link
              to="/messages"
              className="w-9 h-9 flex items-center justify-center text-[var(--text-main)] hover:text-[var(--accent)] scale-tap transition cursor-pointer"
              aria-label="Messages"
            >
              <MessageSquare size={22} />
            </Link>
          </div>
        </header>

        {/* Desktop Header: Circle Status & Privacy Badge */}
        <header className="hidden md:flex items-end justify-between pt-1">
          <div>
            <p className="mb-1 text-[10px] font-bold font-display uppercase tracking-[0.2em] text-sub">
              Your Circle
            </p>
            <h1 className="text-2xl sm:text-3xl font-display font-extrabold tracking-tight text-[var(--text-main)]">
              Good to see you.
            </h1>
          </div>
          <div className="flex items-center gap-2 rounded-full field px-3.5 py-1.5 text-xs font-semibold text-[var(--text-main)] border border-[var(--card-border)]">
            <ShieldCheck size={14} className="accent-text" />
            <span className="font-medium text-[11px]">Private by default</span>
          </div>
        </header>

        {/* Stories row: Real functional shortcut linking to Create Post (No decorative fake circles) */}
        <section aria-label="Stories and quick create" className="pt-1">
          <div className="flex items-center gap-4 overflow-x-auto pb-2 scrollbar-none">
            <Link
              to="/create-post"
              className="flex flex-col items-center gap-1.5 shrink-0 group cursor-pointer"
            >
              <div className="w-16 h-16 rounded-full border-2 border-[var(--accent)] flex items-center justify-center bg-[var(--card-bg)] shadow-sm group-hover:scale-105 transition-transform scale-tap">
                <Plus size={24} className="text-[var(--accent)]" />
              </div>
              <span className="text-[11px] font-medium text-sub group-hover:text-[var(--text-main)] transition-colors">
                Your story
              </span>
            </Link>
          </div>
        </section>

        {/* Desktop Composer box */}
        <div className="hidden md:block">
          <CreatePostBox onCreate={handleCreatePost} currentUser={user} />
        </div>

        {/* Feed List */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2].map((n) => (
              <div
                key={n}
                className="glass rounded-3xl p-5 border border-[var(--card-border)] animate-pulse"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-[var(--card-border)]" />
                  <div className="space-y-2 flex-1">
                    <div className="w-28 h-4 rounded bg-[var(--card-border)]" />
                    <div className="w-20 h-3 rounded bg-[var(--card-border)]" />
                  </div>
                </div>
                <div className="w-full h-44 rounded-2xl bg-[var(--card-border)] mb-3" />
                <div className="w-3/4 h-3.5 rounded bg-[var(--card-border)]" />
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="glass rounded-3xl p-10 text-center border border-[var(--card-border)]">
            <div className="w-12 h-12 rounded-2xl accent-soft-bg flex items-center justify-center mx-auto mb-3 text-[var(--accent)]">
              <Sparkles size={22} />
            </div>
            <p className="font-display font-bold text-[var(--text-main)] text-sm">Your feed is quiet.</p>
            <p className="mt-1 text-xs text-sub max-w-xs mx-auto font-body">
              Share a thought, video, photo, or poll with your trusted circle.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                currentUserId={user.id}
                onPostUpdated={loadPosts}
              />
            ))}
          </div>
        )}
      </main>
    </AppShell>
  )
}
