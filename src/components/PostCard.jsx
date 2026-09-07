// src/components/PostCard.jsx
// Renders feed posts matching the HTML layout and schema.

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useUI } from '@/contexts/UIContext'
import { Heart, MessageSquare, Send, MoreHorizontal, EyeOff, Shield, Trash2, Edit3 } from 'lucide-react'

export default function PostCard({ post, currentUserId, onPostUpdated }) {
  const { t, showToast } = useUI()

  // ---- Likes ----
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)

  // ---- Comments ----
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState('')
  const [loadingComments, setLoadingComments] = useState(false)
  const [submittingComment, setSubmittingComment] = useState(false)

  // ---- Menu Modals ----
  const [showMenu, setShowMenu] = useState(false)
  const [showAudienceModal, setShowAudienceModal] = useState(false)
  const [audienceChoice, setAudienceChoice] = useState('approved')

  // ---- Edit mode ----
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(post.content || '')

  const isOwner = currentUserId === post.author_id

  useEffect(() => {
    loadLikes()

    async function loadLikes() {
      const { count } = await supabase
        .from('likes')
        .select('*', { count: 'exact', head: true })
        .eq('post_id', post.id)
      setLikeCount(count || 0)

      if (currentUserId) {
        const { data } = await supabase
          .from('likes')
          .select('id')
          .eq('post_id', post.id)
          .eq('user_id', currentUserId)
          .maybeSingle()
        setLiked(!!data)
      }
    }
  }, [post.id, currentUserId])

  async function toggleLike() {
    if (liked) {
      setLiked(false)
      setLikeCount((c) => Math.max(0, c - 1))
      await supabase
        .from('likes')
        .delete()
        .eq('post_id', post.id)
        .eq('user_id', currentUserId)
    } else {
      setLiked(true)
      setLikeCount((c) => c + 1)
      await supabase
        .from('likes')
        .insert({ post_id: post.id, user_id: currentUserId })
    }
  }

  async function loadComments() {
    setLoadingComments(true)
    const { data } = await supabase
      .from('comments')
      .select('id, content, created_at, user:user_id(id, username, display_name, avatar_url)')
      .eq('post_id', post.id)
      .order('created_at', { ascending: true })
    setComments(data || [])
    setLoadingComments(false)
  }

  function handleToggleComments() {
    if (!showComments) {
      loadComments()
    }
    setShowComments(!showComments)
  }

  async function submitComment(e) {
    e.preventDefault()
    if (!commentText.trim() || submittingComment) return
    const text = commentText.trim()
    setCommentText('')
    setSubmittingComment(true)
    await supabase
      .from('comments')
      .insert({ post_id: post.id, user_id: currentUserId, content: text })
    await loadComments()
    setSubmittingComment(false)
  }

  async function handleDelete() {
    setShowMenu(false)
    await supabase.from('posts').delete().eq('id', post.id)
    showToast(t('postDeleted'))
    onPostUpdated?.()
  }

  async function handleEdit() {
    if (!editContent.trim()) return
    await supabase
      .from('posts')
      .update({ content: editContent.trim() })
      .eq('id', post.id)
    setEditing(false)
    showToast(t('postEdit'))
    onPostUpdated?.()
  }

  function handleHide() {
    setShowMenu(false)
    const el = document.getElementById(`post-${post.id}`)
    if (el) {
      el.style.transition = 'all 0.3s ease'
      el.style.opacity = '0'
      el.style.maxHeight = '0'
      el.style.overflow = 'hidden'
      el.style.margin = '0'
      el.style.padding = '0'
    }
    showToast(t('postHidden'))
  }

  const author = post.author || {}
  const timeAgo = formatTimeAgo(post.created_at)

  function formatNum(n) {
    if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'K'
    return n
  }

  return (
    <>
      <article
        id={`post-${post.id}`}
        className="glass rounded-3xl overflow-hidden shadow-glass transition-all duration-300 border border-[var(--card-border)]"
      >
        {/* Post Header */}
        <div className="flex items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-3">
            <Link to={`/${author.username || author.id}`}>
              <img
                src={
                  author.avatar_url ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(
                    author.display_name || 'User'
                  )}&background=4A7A8C&color=fff`
                }
                alt=""
                className="w-10 h-10 rounded-full object-cover ring-2 ring-[var(--card-border)]"
              />
            </Link>
            <div className="leading-tight">
              <Link
                to={`/${author.username || author.id}`}
                className="text-sm font-bold flex items-center gap-1.5 hover:underline text-[var(--text-main)]"
              >
                <span>{author.display_name || 'User'}</span>
                <i
                  className="fa-solid fa-badge-check text-[11px]"
                  style={{ color: '#8FBC94' }}
                />
              </Link>
              <p className="text-[11px] text-sub mt-0.5">
                @{author.username || 'user'} · {timeAgo}
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowMenu(true)}
            className="w-8 h-8 rounded-full field flex items-center justify-center scale-tap transition cursor-pointer hover:border-[#4A7A8C]"
            aria-label="Options"
          >
            <MoreHorizontal size={16} className="text-sub" />
          </button>
        </div>

        {/* Post Image */}
        {post.image_url && (
          <div className="w-full bg-[var(--card-border)]/20 overflow-hidden">
            <img
              src={post.image_url}
              alt="Post media"
              className="w-full max-h-[32rem] object-contain"
              loading="lazy"
            />
          </div>
        )}

        {/* Post Body & Actions */}
        <div className="px-5 py-4">
          <div className="flex items-center gap-5 mb-3">
            <button
              onClick={toggleLike}
              className="flex items-center gap-1.5 text-xs font-bold scale-tap transition cursor-pointer text-[var(--text-main)]"
            >
              <Heart
                size={18}
                className={
                  liked
                    ? 'fill-[#4A7A8C] text-[#4A7A8C] dark:fill-[#CFE3E9] dark:text-[#CFE3E9]'
                    : 'text-sub'
                }
              />
              <span>{formatNum(likeCount)}</span>
            </button>

            <button
              onClick={handleToggleComments}
              className="flex items-center gap-1.5 text-xs font-bold scale-tap transition cursor-pointer text-[var(--text-main)]"
            >
              <MessageSquare size={17} className="text-sub" />
              <span>{formatNum(comments.length)}</span>
            </button>

            <button
              onClick={() => {
                if (navigator.share) {
                  navigator.share({
                    title: 'Cirvy Post',
                    text: post.content,
                    url: window.location.href,
                  })
                } else {
                  showToast('Link copied to clipboard')
                }
              }}
              className="flex items-center gap-1.5 text-xs font-medium scale-tap transition ms-auto cursor-pointer text-sub hover:text-[var(--text-main)]"
              aria-label="Share post"
            >
              <Send size={16} />
            </button>
          </div>

          {editing ? (
            <div className="space-y-2 mt-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="field w-full rounded-2xl p-3 text-sm outline-none focus:border-[#4A7A8C]"
                rows={3}
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setEditing(false)
                    setEditContent(post.content || '')
                  }}
                  className="field px-3.5 py-1.5 rounded-full text-xs font-semibold scale-tap"
                >
                  {t('cancel')}
                </button>
                <button
                  onClick={handleEdit}
                  className="accent-bg text-[#F5F7F8] dark:text-[#10181C] px-4 py-1.5 rounded-full text-xs font-bold scale-tap"
                >
                  {t('save')}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--text-main)] leading-relaxed whitespace-pre-wrap">
              <span className="font-bold mr-1.5">
                @{author.username || 'user'}
              </span>
              {post.content}
            </p>
          )}
        </div>

        {/* Expandable Comment Drawer */}
        {showComments && (
          <div className="border-t border-[var(--card-border)] bg-[var(--bg)]/50 p-4 space-y-3">
            <div className="space-y-2.5 max-h-60 overflow-y-auto">
              {loadingComments ? (
                <p className="text-xs text-sub text-center py-2">Loading replies…</p>
              ) : comments.length === 0 ? (
                <p className="text-xs text-sub text-center py-2">
                  No comments yet. Share your thoughts!
                </p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="flex items-start gap-2.5 text-xs">
                    <Link to={`/${c.user?.username || c.user?.id}`}>
                      <img
                        src={
                          c.user?.avatar_url ||
                          `https://ui-avatars.com/api/?name=${encodeURIComponent(
                            c.user?.display_name || 'U'
                          )}&background=4A7A8C&color=fff`
                        }
                        alt=""
                        className="w-7 h-7 rounded-full object-cover mt-0.5"
                      />
                    </Link>
                    <div className="flex-1 field rounded-2xl p-2.5">
                      <div className="flex items-baseline justify-between mb-0.5">
                        <Link
                          to={`/${c.user?.username || c.user?.id}`}
                          className="font-bold text-[var(--text-main)] hover:underline"
                        >
                          @{c.user?.username || 'user'}
                        </Link>
                        <span className="text-[10px] text-sub">
                          {formatTimeAgo(c.created_at)}
                        </span>
                      </div>
                      <span className="text-sub leading-normal">{c.content}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Add comment input */}
            <form onSubmit={submitComment} className="flex gap-2 pt-1">
              <input
                type="text"
                placeholder="Write a private reply…"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                className="field flex-1 rounded-full px-4 py-2.5 text-xs outline-none focus:border-[#4A7A8C]"
              />
              <button
                type="submit"
                disabled={!commentText.trim() || submittingComment}
                className="accent-bg text-[#F5F7F8] dark:text-[#10181C] px-4 py-2 rounded-full text-xs font-bold scale-tap disabled:opacity-50 cursor-pointer"
              >
                {submittingComment ? '…' : 'Send'}
              </button>
            </form>
          </div>
        )}
      </article>

      {/* ============ MODAL: 3-DOT POST MENU ============ */}
      {showMenu && (
        <div className="fixed inset-0 z-[90] flex items-end md:items-center justify-center p-0 md:p-4">
          <div
            className="modal-backdrop absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowMenu(false)}
          />
          <div className="modal-panel relative glass w-full md:w-96 rounded-t-3xl md:rounded-3xl p-3 z-10 border shadow-2xl border-[var(--card-border)]">
            <div className="w-10 h-1 rounded-full bg-[var(--card-border)] mx-auto my-2 md:hidden" />
            {isOwner && (
              <button
                onClick={() => {
                  setShowMenu(false)
                  setEditing(true)
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium field mb-1 scale-tap transition cursor-pointer"
              >
                <Edit3 size={16} className="text-sub" />
                <span>{t('menuEdit')}</span>
              </button>
            )}
            <button
              onClick={handleHide}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium field mb-1 scale-tap transition cursor-pointer"
            >
              <EyeOff size={16} className="text-sub" />
              <span>{t('menuHide')}</span>
            </button>
            <button
              onClick={() => {
                setShowMenu(false)
                setShowAudienceModal(true)
              }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium field mb-1 scale-tap transition cursor-pointer"
            >
              <Shield size={16} className="text-sub" />
              <span>{t('menuAudience')}</span>
            </button>
            {isOwner && (
              <button
                onClick={handleDelete}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium field mb-1 scale-tap transition cursor-pointer text-red-500 hover:border-red-500"
              >
                <Trash2 size={16} />
                <span>{t('menuDelete')}</span>
              </button>
            )}
            <button
              onClick={() => setShowMenu(false)}
              className="w-full text-center py-2.5 text-xs font-bold text-sub mt-1 cursor-pointer"
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {/* ============ MODAL: COMMENT AUDIENCE ============ */}
      {showAudienceModal && (
        <div className="fixed inset-0 z-[90] flex items-end md:items-center justify-center p-0 md:p-4">
          <div
            className="modal-backdrop absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowAudienceModal(false)}
          />
          <div className="modal-panel relative glass w-full md:w-96 rounded-t-3xl md:rounded-3xl p-5 z-10 border shadow-2xl border-[var(--card-border)]">
            <h3 className="font-display font-bold text-lg mb-1 text-[var(--text-main)]">
              {t('audienceTitle')}
            </h3>
            <p className="text-xs text-sub mb-4">{t('audienceSub')}</p>
            <div className="space-y-2">
              <label className="flex items-center justify-between field rounded-2xl px-4 py-3 cursor-pointer">
                <span className="text-sm font-medium text-[var(--text-main)]">{t('everyone')}</span>
                <input
                  type="radio"
                  name={`audience-${post.id}`}
                  checked={audienceChoice === 'approved'}
                  onChange={() => setAudienceChoice('approved')}
                  className="w-4 h-4 accent-[#4A7A8C]"
                />
              </label>
              <label className="flex items-center justify-between field rounded-2xl px-4 py-3 cursor-pointer">
                <span className="text-sm font-medium text-[var(--text-main)]">{t('closeFriendsOnly')}</span>
                <input
                  type="radio"
                  name={`audience-${post.id}`}
                  checked={audienceChoice === 'close'}
                  onChange={() => setAudienceChoice('close')}
                  className="w-4 h-4 accent-[#4A7A8C]"
                />
              </label>
              <label className="flex items-center justify-between field rounded-2xl px-4 py-3 cursor-pointer">
                <span className="text-sm font-medium text-[var(--text-main)]">{t('disableComments')}</span>
                <input
                  type="radio"
                  name={`audience-${post.id}`}
                  checked={audienceChoice === 'disabled'}
                  onChange={() => setAudienceChoice('disabled')}
                  className="w-4 h-4 accent-[#4A7A8C]"
                />
              </label>
            </div>
            <button
              onClick={() => {
                setShowAudienceModal(false)
                showToast(t('audienceSaved'))
              }}
              className="w-full accent-bg text-[#F5F7F8] dark:text-[#10181C] rounded-full py-3 font-bold text-xs mt-5 scale-tap transition cursor-pointer"
            >
              {t('save')}
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function formatTimeAgo(dateStr) {
  if (!dateStr) return 'now'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}
