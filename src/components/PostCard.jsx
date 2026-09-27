import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useUI } from '@/contexts/UIContext'
import { Heart, MessageSquare, Send, MoreHorizontal, EyeOff, Shield, Trash2, Edit3, BarChart2, CheckCircle2 } from 'lucide-react'

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

  // ---- Poll ----
  const [poll, setPoll] = useState(post.poll || null)
  const [pollVotes, setPollVotes] = useState([])
  const [userVotedIndex, setUserVotedIndex] = useState(null)
  const [voting, setVoting] = useState(false)

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

    if (post.poll) {
      setPoll(post.poll)
      loadVotes(post.poll.id)
    } else {
      loadPoll()
    }

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
  }, [post.id, post.poll, currentUserId])

  async function loadVotes(pollId) {
    if (!pollId) return
    try {
      const { data: votes } = await supabase
        .from('poll_votes')
        .select('option_index, user_id')
        .eq('poll_id', pollId)

      if (votes) {
        setPollVotes(votes)
        const myVote = votes.find((v) => v.user_id === currentUserId)
        if (myVote !== undefined) setUserVotedIndex(myVote.option_index)
      }
    } catch {
      // Ignored
    }
  }

  async function loadPoll() {
    try {
      const { data: pollData } = await supabase
        .from('polls')
        .select('id, question, options')
        .eq('post_id', post.id)
        .maybeSingle()

      if (pollData) {
        setPoll(pollData)
        await loadVotes(pollData.id)
      }
    } catch {
      // Ignored
    }
  }

  async function handleVote(optionIndex) {
    if (!currentUserId || !poll || voting) return
    setVoting(true)
    try {
      const { error } = await supabase.from('poll_votes').upsert(
        {
          poll_id: poll.id,
          user_id: currentUserId,
          option_index: optionIndex,
        },
        { onConflict: 'poll_id,user_id' }
      )
      if (!error) {
        setUserVotedIndex(optionIndex)
        setPollVotes((prev) => [
          ...prev.filter((v) => v.user_id !== currentUserId),
          { poll_id: poll.id, user_id: currentUserId, option_index: optionIndex },
        ])
        showToast('Vote recorded')
      }
    } catch {
      showToast('Could not record vote')
    } finally {
      setVoting(false)
    }
  }

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
                  )}&background=00AFA0&color=fff`
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
              </Link>
              <p className="text-[11px] text-sub mt-0.5">
                @{author.username || 'user'} · {timeAgo}
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowMenu(true)}
            className="w-8 h-8 rounded-full field flex items-center justify-center scale-tap transition cursor-pointer hover:border-[var(--accent)]"
            aria-label="Options"
          >
            <MoreHorizontal size={16} className="text-sub" />
          </button>
        </div>

        {/* Post Video or Image */}
        {(() => {
          const videoSrc =
            post.video_url ||
            (post.image_url &&
              (post.image_url.match(/\.(mp4|webm|ogg|mov)$/i) ||
                post.image_url.startsWith('data:video/'))
              ? post.image_url
              : null)
          const imageSrc = !videoSrc ? post.image_url : null

          return (
            <>
              {videoSrc && (
                <div className="w-full bg-black/40 overflow-hidden">
                  <video
                    src={videoSrc}
                    controls
                    playsInline
                    className="w-full max-h-[32rem] object-contain"
                  />
                </div>
              )}
              {imageSrc && (
                <div className="w-full bg-[var(--card-border)]/20 overflow-hidden">
                  <img
                    src={imageSrc}
                    alt="Post media"
                    className="w-full max-h-[32rem] object-contain"
                    loading="lazy"
                  />
                </div>
              )}
            </>
          )
        })()}

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
                    ? 'fill-[var(--accent)] text-[var(--accent)]'
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
                className="field w-full rounded-2xl p-3 text-sm outline-none focus:border-[var(--accent)]"
                rows={3}
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setEditing(false)
                    setEditContent(post.content || '')
                  }}
                  className="field px-3.5 py-1.5 rounded-full text-xs font-semibold scale-tap cursor-pointer"
                >
                  {t('cancel')}
                </button>
                <button
                  onClick={handleEdit}
                  className="accent-bg text-white dark:text-[#070D0C] px-4 py-1.5 rounded-full text-xs font-bold font-display scale-tap cursor-pointer"
                >
                  {t('save')}
                </button>
              </div>
            </div>
          ) : (
            <div>
              {post.content && (
                <p className="text-sm text-[var(--text-main)] leading-relaxed whitespace-pre-wrap">
                  <span className="font-bold mr-1.5">
                    @{author.username || 'user'}
                  </span>
                  {post.content}
                </p>
              )}

              {/* Interactive Poll Card */}
              {poll && (
                <div className="mt-3.5 rounded-2xl field p-4 border border-[var(--card-border)] space-y-3 bg-[var(--card-border)]/10">
                  <div className="flex items-center gap-2">
                    <BarChart2 size={16} className="text-[var(--accent)]" />
                    <h4 className="text-sm font-bold font-display text-[var(--text-main)]">
                      {poll.question}
                    </h4>
                  </div>
                  <div className="space-y-2">
                    {poll.options?.map((opt, idx) => {
                      const total = pollVotes.length
                      const count = pollVotes.filter((v) => v.option_index === idx).length
                      const pct = total > 0 ? Math.round((count / total) * 100) : 0
                      const isSelected = userVotedIndex === idx
                      const hasVoted = userVotedIndex !== null

                      return (
                        <button
                          key={idx}
                          type="button"
                          disabled={voting}
                          onClick={() => handleVote(idx)}
                          className={`relative w-full overflow-hidden rounded-xl border p-3 text-left transition scale-tap cursor-pointer ${isSelected
                              ? 'border-[var(--accent)] bg-[var(--accent)]/15 font-semibold text-[var(--text-main)]'
                              : 'border-[var(--card-border)] bg-[var(--bg)]/60 hover:border-[var(--accent)]/50 text-[var(--text-main)]'
                            }`}
                        >
                          {hasVoted && (
                            <div
                              className="absolute inset-y-0 left-0 bg-[var(--accent)]/20 transition-all duration-500 pointer-events-none"
                              style={{ width: `${pct}%` }}
                            />
                          )}
                          <div className="relative flex items-center justify-between text-xs z-10">
                            <div className="flex items-center gap-2">
                              {isSelected ? (
                                <CheckCircle2 size={14} className="text-[var(--accent)]" />
                              ) : (
                                <span className="w-3.5 h-3.5 rounded-full border border-sub/50 inline-block" />
                              )}
                              <span>{opt.text || opt}</span>
                            </div>
                            {hasVoted && (
                              <span className="font-display text-[11px] font-bold text-sub">
                                {pct}% ({count})
                              </span>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-sub pt-1 font-display">
                    <span>{pollVotes.length} {pollVotes.length === 1 ? 'vote' : 'votes'}</span>
                    {userVotedIndex !== null && <span>Your vote is recorded</span>}
                  </div>
                </div>
              )}
            </div>
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
                          )}&background=00AFA0&color=fff`
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
                className="field flex-1 rounded-full px-4 py-2.5 text-xs outline-none focus:border-[var(--accent)]"
              />
              <button
                type="submit"
                disabled={!commentText.trim() || submittingComment}
                className="accent-bg text-white dark:text-[#070D0C] px-4 py-2 rounded-full text-xs font-bold font-display scale-tap disabled:opacity-50 cursor-pointer"
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
                  className="w-4 h-4 accent-[var(--accent)]"
                />
              </label>
              <label className="flex items-center justify-between field rounded-2xl px-4 py-3 cursor-pointer">
                <span className="text-sm font-medium text-[var(--text-main)]">{t('closeFriendsOnly')}</span>
                <input
                  type="radio"
                  name={`audience-${post.id}`}
                  checked={audienceChoice === 'close'}
                  onChange={() => setAudienceChoice('close')}
                  className="w-4 h-4 accent-[var(--accent)]"
                />
              </label>
              <label className="flex items-center justify-between field rounded-2xl px-4 py-3 cursor-pointer">
                <span className="text-sm font-medium text-[var(--text-main)]">{t('disableComments')}</span>
                <input
                  type="radio"
                  name={`audience-${post.id}`}
                  checked={audienceChoice === 'disabled'}
                  onChange={() => setAudienceChoice('disabled')}
                  className="w-4 h-4 accent-[var(--accent)]"
                />
              </label>
            </div>
            <button
              onClick={() => {
                setShowAudienceModal(false)
                showToast(t('audienceSaved'))
              }}
              className="w-full accent-bg text-white dark:text-[#070D0C] rounded-full py-3 font-bold font-display text-xs mt-5 scale-tap transition cursor-pointer"
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
