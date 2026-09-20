// src/pages/CreatePostPage.jsx
// Dedicated route for creating posts, videos, and polls in Cirvy.

import { useNavigate } from 'react-router-dom'
import { ShieldCheck, ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useUI } from '@/contexts/UIContext'
import AppShell from '@/components/AppShell'
import CreatePostBox from '@/components/CreatePostBox'

export default function CreatePostPage() {
  const { user } = useAuth()
  const { showToast } = useUI()
  const navigate = useNavigate()

  async function handleCreatePost({ content, imageUrl, videoUrl, poll }) {
    if (!user) return false

    try {
      // 1. Insert post record
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
        // If video_url column is not yet in remote DB, fallback to image_url or content
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('posts')
          .insert({
            author_id: user.id,
            content: content || '',
            image_url: imageUrl || videoUrl || null,
          })
          .select('id')
          .single()

        if (fallbackError) {
          showToast('Could not publish your post. Please try again.')
          return false
        }
        postData.id = fallbackData.id
      }

      // 2. If poll data attached, insert into polls table
      if (poll && postData?.id) {
        try {
          await supabase.from('polls').insert({
            post_id: postData.id,
            question: poll.question,
            options: poll.options,
          })
        } catch {
          // Poll table fallback
        }
      }

      showToast('Post published to your circle')
      navigate('/feed')
      return true
    } catch {
      showToast('An error occurred while publishing')
      return false
    }
  }

  return (
    <AppShell rightSidebar>
      <main className="min-w-0 py-2 lg:max-w-2xl mx-auto">
        <header className="mb-7 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="w-8 h-8 rounded-full field flex items-center justify-center scale-tap hover:border-[#4A7A8C] cursor-pointer"
              aria-label="Go back"
            >
              <ArrowLeft size={16} className="text-sub" />
            </button>
            <div>
              <p className="text-[11px] font-bold font-display uppercase tracking-[0.18em] text-sub">
                New Post
              </p>
              <h1 className="text-2xl sm:text-3xl font-display font-extrabold tracking-tight text-[var(--text-main)]">
                Create Post
              </h1>
            </div>
          </div>
          <div className="hidden items-center gap-2 rounded-full field px-3.5 py-2 text-xs font-semibold text-[var(--text-main)] sm:flex">
            <ShieldCheck size={15} className="accent-text" />
            <span>Circle only</span>
          </div>
        </header>

        <CreatePostBox onCreate={handleCreatePost} currentUser={user} />
      </main>
    </AppShell>
  )
}
