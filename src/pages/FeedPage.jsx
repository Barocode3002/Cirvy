// src/pages/FeedPage.jsx
// Friends-only Feed view strictly mapped to the HTML design & Supabase schema.

import { useEffect, useState } from 'react'
import { ShieldCheck, Users, Sparkles } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useUI } from '@/contexts/UIContext'
import { supabase } from '@/lib/supabase'
import CreatePostBox from '@/components/CreatePostBox'
import PostCard from '@/components/PostCard'
import AppShell from '@/components/AppShell'

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
    const authorIds = [user.id, ...friendIds]

    const { data } = await supabase
      .from('posts')
      .select(
        'id, content, image_url, author_id, created_at, author:author_id(id, username, display_name, avatar_url)'
      )
      .in('author_id', authorIds)
      .order('created_at', { ascending: false })
      .limit(50)

    setPosts(data || [])
    setLoading(false)
  }

  async function handleCreatePost({ content, imageUrl }) {
    const { error } = await supabase
      .from('posts')
      .insert({ author_id: user.id, content, image_url: imageUrl })
    if (error) {
      showToast('Could not publish your post')
      return false
    }
    showToast('Post published to your circle')
    await loadPosts()
    return true
  }

  return (
    <AppShell rightSidebar>
      <main className="min-w-0 py-2 lg:max-w-2xl mx-auto">
        <header className="mb-7 flex items-end justify-between">
          <div>
            <p className="mb-1 text-[11px] font-bold font-mono uppercase tracking-[0.18em] text-sub">
              Your Circle
            </p>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[var(--text-main)]">
              Good to see you.
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-sub">
              A quiet place for the people who matter.
            </p>
          </div>
          <div className="hidden items-center gap-2 rounded-full field px-3.5 py-2 text-xs font-semibold text-[var(--text-main)] sm:flex">
            <ShieldCheck size={15} className="accent-text" />
            <span>Private by default</span>
          </div>
        </header>

        <CreatePostBox onCreate={handleCreatePost} currentUser={user} />

        <div className="my-6 flex items-center gap-3">
          <Users size={16} className="text-sub" />
          <h2 className="text-xs font-bold font-mono uppercase tracking-wider text-[var(--text-main)]">
            Latest from your circle
          </h2>
          <div className="h-px flex-1 bg-[var(--card-border)]" />
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
            <div className="w-12 h-12 rounded-2xl bg-[#8FBC94]/15 flex items-center justify-center mx-auto mb-3 text-[#8FBC94]">
              <Sparkles size={22} />
            </div>
            <p className="font-bold text-[var(--text-main)] text-sm">Your feed is quiet.</p>
            <p className="mt-1 text-xs text-sub max-w-xs mx-auto">
              Share a thought or photo above with your trusted friends.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
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
