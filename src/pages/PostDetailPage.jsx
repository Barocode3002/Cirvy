import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useUI } from '@/contexts/UIContext'
import AppShell from '@/components/AppShell'
import PostCard from '@/components/PostCard'
import { ArrowLeft, Loader2, Lock } from 'lucide-react'

export default function PostDetailPage() {
  const { postId } = useParams()
  const navigate = useNavigate()
  const { showToast } = useUI()
  const [post, setPost] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isTransientError, setIsTransientError] = useState(false)

  const currentUserId = JSON.parse(localStorage.getItem('cirvy_user') || '{}')?.id

  const loadPost = useCallback(async () => {
    if (!postId) return
    setLoading(true)
    setError(null)
    setIsTransientError(false)

    try {
      const { data, error: fetchError } = await supabase
        .from('posts')
        .select('id, author_id, content, image_url, is_archived, created_at, author:author_id(id, username, display_name, avatar_url)')
        .eq('id', postId)
        .maybeSingle()

      if (fetchError) {
        console.error('[POST DETAIL] Fetch error:', fetchError)
        if (fetchError.code === '42P01' || fetchError.code === 'PGRST116') {
          setIsTransientError(false)
          setError('unavailable')
        } else {
          setIsTransientError(true)
          setError(fetchError.message)
        }
        setLoading(false)
        return
      }

      if (!data || data.is_archived) {
        setIsTransientError(false)
        setError('unavailable')
        setLoading(false)
        return
      }

      setPost(data)
      setLoading(false)
    } catch (err) {
      console.error('[POST DETAIL] Load error:', err)
      setIsTransientError(true)
      setError(err.message)
      setLoading(false)
    }
  }, [postId])

  useEffect(() => {
    loadPost()
  }, [loadPost])

  function handleRetry() {
    loadPost()
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2 size={32} className="animate-spin text-[var(--accent)]" />
        </div>
      </AppShell>
    )
  }

  if (error === 'unavailable' || (!post && !isTransientError)) {
    return (
      <AppShell>
        <div className="max-w-2xl mx-auto px-4 py-8">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-sub hover:text-[var(--text-main)] mb-6 transition-colors cursor-pointer"
          >
            <ArrowLeft size={18} />
            <span className="text-sm font-medium">Back</span>
          </button>

          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-8 flex flex-col items-center justify-center gap-4 min-h-[300px]">
            <div className="w-16 h-16 rounded-full bg-[var(--card-border)]/40 flex items-center justify-center">
              <Lock size={28} className="text-sub" />
            </div>
            <div className="text-center">
              <h2 className="text-lg font-bold text-[var(--text-main)] mb-2">Post unavailable</h2>
              <p className="text-sm text-sub">
                This post is no longer available or you don't have permission to view it
              </p>
            </div>
          </div>
        </div>
      </AppShell>
    )
  }

  if (isTransientError) {
    return (
      <AppShell>
        <div className="max-w-2xl mx-auto px-4 py-8">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-sub hover:text-[var(--text-main)] mb-6 transition-colors cursor-pointer"
          >
            <ArrowLeft size={18} />
            <span className="text-sm font-medium">Back</span>
          </button>

          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-8 flex flex-col items-center justify-center gap-4 min-h-[300px]">
            <div className="text-center">
              <h2 className="text-lg font-bold text-[var(--text-main)] mb-2">Could not load post</h2>
              <p className="text-sm text-sub mb-4">Network error. Tap to retry.</p>
              <button
                onClick={handleRetry}
                className="accent-bg text-white dark:text-[#070D0C] px-6 py-2 rounded-full text-sm font-bold font-display scale-tap transition cursor-pointer"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      </AppShell>
    )
  }

  if (!post) return null

  const videoSrc =
    post.image_url &&
    (post.image_url.match(/\.(mp4|webm|ogg|mov)$/i) ||
      post.image_url.startsWith('data:video/'))
      ? post.image_url
      : null
  const imageSrc = !videoSrc ? post.image_url : null

  const postWithMedia = {
    ...post,
    video_url: videoSrc,
    image_url: imageSrc
  }

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sub hover:text-[var(--text-main)] mb-4 transition-colors cursor-pointer"
        >
          <ArrowLeft size={18} />
          <span className="text-sm font-medium">Back</span>
        </button>

        <PostCard
          post={postWithMedia}
          currentUserId={currentUserId}
          onPostUpdated={() => {
            loadPost()
          }}
        />
      </div>
    </AppShell>
  )
}
