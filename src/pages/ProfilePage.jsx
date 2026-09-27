import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import FriendButton from '../components/FriendButton'
import AppShell from '@/components/AppShell'
import { useUI } from '@/contexts/UIContext'
import { useAuth } from '@/contexts/AuthContext'
import { usePresence } from '@/contexts/PresenceContext'
import { Camera, Image, X, Heart, MessageSquare, Send, Settings } from 'lucide-react'

export default function ProfilePage() {
  const { userId, username } = useParams()
  const { t, showToast } = useUI()
  const { signOut } = useAuth()
  const { isOnline } = usePresence()
  const navigate = useNavigate()

  const [profile, setProfile] = useState(null)
  const [isFriend, setIsFriend] = useState(false)
  const [currentUserId, setCurrentUserId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [friendCount, setFriendCount] = useState(0)
  const [mutualFriendCount, setMutualFriendCount] = useState(0)
  const [postCount, setPostCount] = useState(0)
  const [posts, setPosts] = useState([])

  // Post detail modal state
  const [selectedPost, setSelectedPost] = useState(null)
  const [selectedPostLiked, setSelectedPostLiked] = useState(false)
  const [selectedPostLikeCount, setSelectedPostLikeCount] = useState(0)
  const [selectedPostComments, setSelectedPostComments] = useState([])
  const [loadingComments, setLoadingComments] = useState(false)
  const [commentInput, setCommentInput] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)

  // Edit Bio modal state
  const [showEditBio, setShowEditBio] = useState(false)
  const [bioInput, setBioInput] = useState('')
  const [savingBio, setSavingBio] = useState(false)
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState('')
  const [avatarError, setAvatarError] = useState('')

  const rawParam = username || userId || ''
  const userIsOnline = profile ? isOnline(profile.id) : false

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview('')
      return undefined
    }
    const objectUrl = URL.createObjectURL(avatarFile)
    setAvatarPreview(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [avatarFile])

  useEffect(() => {
    loadProfile()

    async function loadProfile() {
      setLoading(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      setCurrentUserId(user.id)

      if (!rawParam) {
        setProfile(null)
        setLoading(false)
        return
      }

      // Check if param is UUID or username
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        rawParam
      )
      const cleanParam = rawParam.toLowerCase().replace(/^@/, '')

      // 1) Find the target user profile row
      let targetUserQuery = supabase.from('profiles')
      if (isUuid) {
        targetUserQuery = targetUserQuery.select('id, username').eq('id', rawParam).maybeSingle()
      } else {
        targetUserQuery = targetUserQuery
          .select('id, username')
          .ilike('username', cleanParam)
          .maybeSingle()
      }

      const { data: baseProfile } = await targetUserQuery
      if (!baseProfile) {
        setProfile(null)
        setLoading(false)
        return
      }

      const targetId = baseProfile.id
      const isOwn = user.id === targetId

      // 2) Check friendship status
      let isFr = isOwn
      if (!isOwn) {
        const { data: friendship } = await supabase
          .from('friendships')
          .select('status')
          .or(
            `and(requester_id.eq.${user.id},addressee_id.eq.${targetId}),and(requester_id.eq.${targetId},addressee_id.eq.${user.id})`
          )
          .eq('status', 'accepted')
          .maybeSingle()
        isFr = !!friendship
      }
      setIsFriend(isFr)

      // 3) Fetch profile columns (privacy enforcement: bio only for friends)
      const columns = isFr
        ? 'id, username, display_name, avatar_url, bio, created_at'
        : 'id, username, display_name, avatar_url'

      const { data: fullProfile } = await supabase
        .from('profiles')
        .select(columns)
        .eq('id', targetId)
        .single()

      setProfile(fullProfile)
      if (fullProfile?.bio) setBioInput(fullProfile.bio)

      // Total friends count for this profile
      const { data: profileFriendships } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .or(`requester_id.eq.${targetId},addressee_id.eq.${targetId}`)
        .eq('status', 'accepted')

      const profileFriendIds = (profileFriendships || []).map((f) =>
        f.requester_id === targetId ? f.addressee_id : f.requester_id
      )
      setFriendCount(profileFriendIds.length)

      // Mutual friends calculation
      if (!isOwn) {
        const { data: viewerFriendships } = await supabase
          .from('friendships')
          .select('requester_id, addressee_id')
          .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
          .eq('status', 'accepted')

        const viewerFriendIds = (viewerFriendships || []).map((f) =>
          f.requester_id === user.id ? f.addressee_id : f.requester_id
        )

        const mutuals = viewerFriendIds.filter((id) => profileFriendIds.includes(id))
        setMutualFriendCount(mutuals.length)
      } else {
        setMutualFriendCount(0)
      }

      const { count: pCount } = await supabase
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .eq('author_id', targetId)
      setPostCount(pCount || 0)

      if (isFr) {
        const { data: userPosts } = await supabase
          .from('posts')
          .select(
            'id, content, image_url, author_id, created_at, author:author_id(id, username, display_name, avatar_url), likes:likes(count), comments:comments(count)'
          )
          .eq('author_id', targetId)
          .order('created_at', { ascending: false })
          .limit(30)

        const formatted = (userPosts || []).map((p) => ({
          ...p,
          like_count: p.likes?.[0]?.count || 0,
          comment_count: p.comments?.[0]?.count || 0,
        }))
        setPosts(formatted)
      }

      setLoading(false)
    }
  }, [rawParam])

  // Open post detail modal and load likes/comments
  async function openPostDetail(post) {
    setSelectedPost(post)
    setSelectedPostLikeCount(post.like_count || 0)
    setLoadingComments(true)

    // Check if liked by current user
    if (currentUserId) {
      const { data } = await supabase
        .from('likes')
        .select('id')
        .eq('post_id', post.id)
        .eq('user_id', currentUserId)
        .maybeSingle()
      setSelectedPostLiked(!!data)
    }

    // Load comments
    const { data: commentData } = await supabase
      .from('comments')
      .select('id, content, created_at, user:user_id(id, username, display_name, avatar_url)')
      .eq('post_id', post.id)
      .order('created_at', { ascending: true })

    setSelectedPostComments(commentData || [])
    setLoadingComments(false)
  }

  async function toggleDetailLike() {
    if (!selectedPost || !currentUserId) return
    if (selectedPostLiked) {
      setSelectedPostLiked(false)
      setSelectedPostLikeCount((c) => Math.max(0, c - 1))
      await supabase
        .from('likes')
        .delete()
        .eq('post_id', selectedPost.id)
        .eq('user_id', currentUserId)
    } else {
      setSelectedPostLiked(true)
      setSelectedPostLikeCount((c) => c + 1)
      await supabase
        .from('likes')
        .insert({ post_id: selectedPost.id, user_id: currentUserId })
    }
    // Update count in post list state
    setPosts((prev) =>
      prev.map((p) =>
        p.id === selectedPost.id
          ? {
            ...p,
            like_count: selectedPostLiked
              ? Math.max(0, p.like_count - 1)
              : p.like_count + 1,
          }
          : p
      )
    )
  }

  async function handleAddDetailComment(e) {
    e.preventDefault()
    if (!commentInput.trim() || submittingComment || !selectedPost) return
    const text = commentInput.trim()
    setCommentInput('')
    setSubmittingComment(true)

    const { error } = await supabase
      .from('comments')
      .insert({ post_id: selectedPost.id, user_id: currentUserId, content: text })

    if (!error) {
      const { data: refreshed } = await supabase
        .from('comments')
        .select('id, content, created_at, user:user_id(id, username, display_name, avatar_url)')
        .eq('post_id', selectedPost.id)
        .order('created_at', { ascending: true })
      setSelectedPostComments(refreshed || [])
      setPosts((prev) =>
        prev.map((p) =>
          p.id === selectedPost.id ? { ...p, comment_count: p.comment_count + 1 } : p
        )
      )
    }
    setSubmittingComment(false)
  }

  async function handleSaveBio(e) {
    e.preventDefault()
    setSavingBio(true)
    try {
      let avatarUrl = profile.avatar_url || null
      if (avatarFile) {
        const extension = avatarFile.name.split('.').pop()?.toLowerCase() || 'jpg'
        const path = `${currentUserId}/${crypto.randomUUID()}.${extension}`
        const { error: uploadError } = await supabase.storage
          .from('profile-media')
          .upload(path, avatarFile, {
            cacheControl: '3600',
            contentType: avatarFile.type,
            upsert: false,
          })
        if (uploadError) {
          avatarUrl = await fileToDataUrl(avatarFile)
        } else {
          avatarUrl = supabase.storage.from('profile-media').getPublicUrl(path).data
            .publicUrl
        }
      }

      const { error } = await supabase
        .from('profiles')
        .update({ bio: bioInput.trim(), avatar_url: avatarUrl })
        .eq('id', currentUserId)
      if (error) throw error

      setProfile((prev) => ({ ...prev, bio: bioInput.trim(), avatar_url: avatarUrl }))
      setAvatarFile(null)
      setShowEditBio(false)
      showToast('Profile updated')
    } catch {
      setAvatarError('Your profile could not be updated. Try again.')
    } finally {
      setSavingBio(false)
    }
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  function handleAvatarChange(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return setAvatarError('Choose an image file.')
    if (file.size > 4 * 1024 * 1024)
      return setAvatarError('Profile pictures must be smaller than 4 MB.')
    setAvatarError('')
    setAvatarFile(file)
  }

  function formatCount(n) {
    if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'K'
    return n
  }

  function formatRelativeTime(dateStr) {
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

  if (loading) {
    return (
      <AppShell>
        <div className="flex-1 max-w-xl mx-auto py-8 px-4 animate-pulse">
          <div className="flex flex-col items-center">
            <div className="w-24 h-24 rounded-full bg-[var(--card-border)] mb-4" />
            <div className="w-36 h-5 rounded-lg bg-[var(--card-border)] mb-2" />
            <div className="w-24 h-3.5 rounded-lg bg-[var(--card-border)] mb-4" />
            <div className="w-56 h-10 rounded-2xl bg-[var(--card-border)] mb-6" />
            <div className="flex gap-10">
              <div className="w-12 h-8 rounded bg-[var(--card-border)]" />
              <div className="w-12 h-8 rounded bg-[var(--card-border)]" />
              <div className="w-12 h-8 rounded bg-[var(--card-border)]" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-8">
            <div className="aspect-square rounded-2xl bg-[var(--card-border)]" />
            <div className="aspect-square rounded-2xl bg-[var(--card-border)]" />
            <div className="aspect-square rounded-2xl bg-[var(--card-border)]" />
          </div>
        </div>
      </AppShell>
    )
  }

  if (!profile) {
    return (
      <AppShell>
        <div className="flex-1 flex items-center justify-center px-4 py-16">
          <div className="glass rounded-3xl p-8 text-center max-w-xs w-full shadow-glass border border-[var(--card-border)]">
            <div className="w-12 h-12 rounded-2xl accent-soft-bg flex items-center justify-center mx-auto mb-3 text-[var(--accent)]">
              <i className="fa-solid fa-magnifying-glass text-lg" />
            </div>
            <h3 className="font-display font-bold text-base mb-1 text-[var(--text-main)]">
              Profile not found
            </h3>
            <p className="text-xs text-sub font-body">@{rawParam.replace(/^@/, '')} does not exist on Cirvy.</p>
          </div>
        </div>
      </AppShell>
    )
  }

  const isOwnProfile = currentUserId === profile.id

  async function handleLogout() {
    if (window.confirm(t('logoutConfirm') || 'Are you sure you want to log out?')) {
      await signOut()
      showToast(t('loggedOut') || 'You have been logged out securely.')
      navigate('/login')
    }
  }

  return (
    <AppShell>
      <main className="flex-1 overflow-y-auto px-4 py-6 view max-w-2xl mx-auto">
        {/* Top action buttons */}
        <div className="flex justify-end gap-2 mb-2">
          {isOwnProfile && (
            <>
              <button
                onClick={() => navigate('/settings')}
                className="w-9 h-9 rounded-full field flex items-center justify-center scale-tap transition cursor-pointer hover:border-[var(--accent)]"
                title="Settings"
                aria-label="Settings"
              >
                <Settings size={16} className="text-sub" />
              </button>
              <button
                onClick={() => setShowEditBio(true)}
                className="w-9 h-9 rounded-full field flex items-center justify-center scale-tap transition cursor-pointer hover:border-[var(--accent)]"
                title="Edit Profile"
                aria-label="Edit Profile"
              >
                <i className="fa-solid fa-pen text-sm text-sub" />
              </button>
              <button
                onClick={handleLogout}
                className="h-9 px-3.5 rounded-full field flex items-center gap-1.5 text-xs font-semibold text-sub hover:text-[var(--text-main)] hover:border-[var(--accent)] scale-tap transition cursor-pointer"
                title={t('logout')}
              >
                <i className="fa-solid fa-arrow-right-from-bracket" />
                <span>{t('logout')}</span>
              </button>
            </>
          )}
        </div>

        {/* Profile Card / Header */}
        <div className="flex flex-col items-center text-center">
          <div className="relative">
            <img
              src={
                profile.avatar_url ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(
                  profile.display_name || 'U'
                )}&background=00AFA0&color=fff&size=150`
              }
              alt=""
              className="w-24 h-24 rounded-full object-cover ring-4 ring-[var(--card-border)]"
            />
            {/* Real Online/Offline Presence Indicator */}
            <span
              className={`absolute bottom-1 right-1 w-4 h-4 rounded-full ring-2 ring-[var(--bg)] transition-colors ${userIsOnline
                  ? 'bg-[var(--accent)] shadow-[0_0_8px_rgba(0,175,160,0.8)] animate-pulse'
                  : 'bg-[#8FA6B0] opacity-60'
                }`}
              title={userIsOnline ? 'Active now' : 'Offline'}
            />
          </div>

          <h3 className="font-display font-extrabold text-xl md:text-2xl mt-3 text-[var(--text-main)] tracking-tight">
            {profile.display_name}
          </h3>
          <p className="text-sub text-xs mt-0.5 font-display">@{profile.username}</p>

          {/* Badges */}
          <div className="flex items-center gap-2 mt-2.5 flex-wrap justify-center">
            <span className="text-[11px] font-display px-3 py-1 rounded-full field flex items-center gap-1.5 font-medium text-sub">
              <i className="fa-solid fa-lock text-[10px]" />
              <span>{t('privateProfile')}</span>
            </span>

            <span
              className={`text-[11px] font-display px-3 py-1 rounded-full flex items-center gap-1.5 font-medium ${userIsOnline
                  ? 'accent-soft-bg text-[var(--accent)] border border-[var(--accent)]/30'
                  : 'field text-sub'
                }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${userIsOnline ? 'bg-[var(--accent)]' : 'bg-[#8FA6B0]'
                  }`}
              />
              <span>{userIsOnline ? 'Active Now' : 'Offline'}</span>
            </span>
          </div>

          {/* Bio */}
          <p className="text-sm font-body text-sub mt-3.5 max-w-sm leading-relaxed px-2">
            {isFriend || isOwnProfile
              ? profile.bio || 'No bio yet.'
              : 'Bio is hidden. Connect to view full profile.'}
          </p>

          {/* Friend action button if not own profile */}
          {!isOwnProfile && (
            <div className="mt-4">
              <FriendButton profileId={profile.id} currentUserId={currentUserId} />
            </div>
          )}

          <div className="flex gap-10 mt-6 text-center border border-[var(--card-border)] py-3.5 px-8 rounded-2xl glass shadow-glass">
            <div>
              <p className="font-display font-bold text-base text-[var(--text-main)]">
                {formatCount(postCount)}
              </p>
              <p className="text-sub text-[11px] uppercase tracking-wider font-display">
                {t('postsLabel')}
              </p>
            </div>
            <div>
              <p className="font-display font-bold text-base text-[var(--text-main)]">
                {formatCount(friendCount)}
              </p>
              <p className="text-sub text-[11px] uppercase tracking-wider font-display">
                {t('friendsLabel')}
              </p>
            </div>
            <div>
              <p className="font-display font-bold text-base text-[var(--text-main)]">
                {isOwnProfile ? '—' : mutualFriendCount}
              </p>
              <p className="text-sub text-[11px] uppercase tracking-wider font-display">
                Mutual
              </p>
            </div>
          </div>
        </div>

        {/* Profile Posts Grid */}
        {isFriend ? (
          <div className="mt-7">
            {posts.length === 0 ? (
              <div className="text-center text-sub text-xs py-12 glass rounded-3xl border border-[var(--card-border)]">
                <div className="w-10 h-10 rounded-2xl bg-[var(--card-border)]/40 flex items-center justify-center mx-auto mb-3">
                  <i className="fa-regular fa-images text-xl opacity-60" />
                </div>
                <p className="font-medium">Nothing shared yet in this circle.</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {posts.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => openPostDetail(p)}
                    className="relative rounded-2xl overflow-hidden aspect-square group bg-[var(--card-bg)] border border-[var(--card-border)] transition-transform scale-tap cursor-pointer text-left focus:outline-none"
                  >
                    {p.image_url ? (
                      <img
                        src={p.image_url}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full p-3 flex items-center justify-center text-xs text-[var(--text-main)] text-center leading-relaxed bg-[var(--card-bg)] font-medium">
                        <span className="line-clamp-4">{p.content}</span>
                      </div>
                    )}
                    {/* Hover Overlay with Like Count */}
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] transition-opacity duration-200 flex items-center justify-center opacity-0 group-hover:opacity-100 gap-3 text-white">
                      <span className="flex items-center gap-1.5 text-xs font-bold font-display">
                        <Heart size={14} className="fill-current" />
                        <span>{formatCount(p.like_count || 0)}</span>
                      </span>
                      {p.comment_count > 0 && (
                        <span className="flex items-center gap-1.5 text-xs font-bold font-display">
                          <MessageSquare size={14} className="fill-current" />
                          <span>{formatCount(p.comment_count)}</span>
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-8 text-center p-8 glass rounded-3xl border border-[var(--card-border)]">
            <i className="fa-solid fa-lock text-2xl text-sub mb-2" />
            <h4 className="font-display font-bold text-sm text-[var(--text-main)]">
              Posts are Private
            </h4>
            <p className="text-xs text-sub mt-1 max-w-xs mx-auto font-body">
              Become accepted friends to see @{profile.username}&apos;s photos and thoughts.
            </p>
          </div>
        )}
      </main>

      {/* ============ MODAL: POST DETAIL VIEW ============ */}
      {selectedPost && (
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-0 md:p-4">
          <div
            className="modal-backdrop absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setSelectedPost(null)}
          />
          <div className="modal-panel relative glass w-full md:max-w-xl max-h-[90vh] rounded-t-3xl md:rounded-3xl p-0 z-10 flex flex-col overflow-hidden border border-[var(--card-border)] shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--card-border)] bg-[var(--card-bg)]">
              <div className="flex items-center gap-2.5">
                <Link to={`/${selectedPost.author?.username || selectedPost.author?.id}`}>
                  <img
                    src={
                      selectedPost.author?.avatar_url ||
                      `https://ui-avatars.com/api/?name=${encodeURIComponent(
                        selectedPost.author?.display_name || 'U'
                      )}&background=00AFA0&color=fff`
                    }
                    alt=""
                    className="w-8 h-8 rounded-full object-cover ring-2 ring-[var(--card-border)]"
                  />
                </Link>
                <div className="leading-tight">
                  <Link
                    to={`/${selectedPost.author?.username || selectedPost.author?.id}`}
                    className="text-xs font-bold text-[var(--text-main)] hover:underline block"
                  >
                    {selectedPost.author?.display_name || 'User'}
                  </Link>
                  <p className="text-[10px] text-sub font-display">
                    @{selectedPost.author?.username} · {formatRelativeTime(selectedPost.created_at)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedPost(null)}
                className="w-8 h-8 rounded-full field flex items-center justify-center scale-tap hover:border-[var(--accent)] cursor-pointer"
                aria-label="Close"
              >
                <X size={15} />
              </button>
            </div>

            {/* Modal Body: Scrollable */}
            <div className="flex-1 overflow-y-auto">
              {selectedPost.image_url && (
                <div className="bg-[var(--card-border)]/30 flex items-center justify-center max-h-96 overflow-hidden">
                  <img
                    src={selectedPost.image_url}
                    alt=""
                    className="w-full max-h-96 object-contain"
                  />
                </div>
              )}

              {/* Caption */}
              <div className="p-5 border-b border-[var(--card-border)]">
                <p className="text-sm text-[var(--text-main)] leading-relaxed whitespace-pre-wrap">
                  <Link
                    to={`/${selectedPost.author?.username || selectedPost.author?.id}`}
                    className="font-bold mr-1.5 hover:underline"
                  >
                    @{selectedPost.author?.username}
                  </Link>
                  {selectedPost.content}
                </p>

                {/* Actions & Likes */}
                <div className="flex items-center gap-4 mt-4 pt-3 border-t border-[var(--card-border)]/60">
                  <button
                    onClick={toggleDetailLike}
                    className="flex items-center gap-1.5 text-xs font-bold scale-tap cursor-pointer transition text-[var(--text-main)]"
                  >
                    <Heart
                      size={17}
                      className={
                        selectedPostLiked
                          ? 'fill-[var(--accent)] text-[var(--accent)]'
                          : 'text-sub'
                      }
                    />
                    <span>{formatCount(selectedPostLikeCount)} likes</span>
                  </button>
                  <span className="flex items-center gap-1.5 text-xs font-medium text-sub">
                    <MessageSquare size={16} />
                    <span>{selectedPostComments.length} comments</span>
                  </span>
                </div>
              </div>

              {/* Comments list */}
              <div className="p-5 space-y-3">
                <h4 className="text-xs font-bold font-display uppercase tracking-wider text-sub">
                  Comments
                </h4>
                {loadingComments ? (
                  <div className="py-6 text-center text-xs text-sub">
                    <i className="fa-solid fa-circle-notch fa-spin mr-1.5" /> Loading replies...
                  </div>
                ) : selectedPostComments.length === 0 ? (
                  <p className="text-xs text-sub text-center py-4">
                    No comments yet. Start the private conversation!
                  </p>
                ) : (
                  selectedPostComments.map((c) => (
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
                            {formatRelativeTime(c.created_at)}
                          </span>
                        </div>
                        <p className="text-sub leading-normal">{c.content}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Comment Form */}
            <form
              onSubmit={handleAddDetailComment}
              className="p-3 border-t border-[var(--card-border)] bg-[var(--card-bg)] flex gap-2"
            >
              <input
                type="text"
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                placeholder="Add a comment..."
                className="field flex-1 rounded-full px-4 py-2.5 text-xs outline-none focus:border-[var(--accent)]"
              />
              <button
                type="submit"
                disabled={!commentInput.trim() || submittingComment}
                className="accent-bg text-white dark:text-[#070D0C] px-4 py-2.5 rounded-full text-xs font-bold font-display scale-tap disabled:opacity-50 cursor-pointer flex items-center gap-1"
              >
                <Send size={13} />
                <span>{submittingComment ? '...' : 'Send'}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ============ MODAL: EDIT BIO ============ */}
      {showEditBio && (
        <div className="fixed inset-0 z-[90] flex items-end md:items-center justify-center p-0 md:p-4">
          <div
            className="modal-backdrop absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowEditBio(false)}
          />
          <div className="modal-panel relative glass w-full md:w-96 rounded-t-3xl md:rounded-3xl p-5 z-10 border border-[var(--card-border)] shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-bold text-lg text-[var(--text-main)]">
                Edit Profile
              </h3>
              <button
                onClick={() => setShowEditBio(false)}
                className="w-8 h-8 rounded-full field flex items-center justify-center scale-tap hover:border-[var(--accent)] cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleSaveBio} className="space-y-4">
              <div>
                <span className="mb-2 block text-xs font-display font-semibold text-[var(--text-main)]">
                  Profile Picture
                </span>
                <div className="flex items-center gap-3 rounded-2xl field p-3">
                  <img
                    src={
                      avatarPreview ||
                      profile.avatar_url ||
                      `https://ui-avatars.com/api/?name=${encodeURIComponent(
                        profile.display_name || 'U'
                      )}&background=00AFA0&color=fff`
                    }
                    alt="Profile preview"
                    className="h-14 w-14 rounded-full object-cover ring-2 ring-[var(--card-border)]"
                  />
                  <div className="min-w-0 flex-1">
                    <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full accent-bg px-3 text-xs font-bold font-display text-white dark:text-[#070D0C] hover:opacity-90 scale-tap">
                      <Image size={13} />
                      <span>{avatarFile ? 'Replace picture' : 'Choose picture'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarChange}
                        className="sr-only"
                      />
                    </label>
                    <p className="mt-1 text-[10px] text-sub">Device gallery or camera</p>
                  </div>
                  {avatarFile && (
                    <button
                      type="button"
                      onClick={() => setAvatarFile(null)}
                      className="rounded-full p-1.5 field text-sub hover:text-[var(--text-main)] scale-tap"
                      aria-label="Remove new profile picture"
                    >
                      <X size={14} />
                    </button>
                  )}
                  <Camera size={16} className="text-sub" />
                </div>
                {avatarError && (
                  <p
                    role="alert"
                    className="mt-2 rounded-xl field px-3 py-1.5 text-xs font-semibold text-red-500 border-red-500/30"
                  >
                    {avatarError}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-display font-semibold text-[var(--text-main)] mb-1.5">
                  Bio
                </label>
                <textarea
                  value={bioInput}
                  onChange={(e) => setBioInput(e.target.value)}
                  rows={3}
                  placeholder="Share a short bio with your circle..."
                  className="field w-full rounded-2xl p-3 text-sm resize-none outline-none focus:border-[var(--accent)]"
                  autoFocus
                />
              </div>

              <div className="flex gap-2 justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setShowEditBio(false)}
                  className="field px-4 py-2 rounded-full text-xs font-semibold scale-tap cursor-pointer"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={savingBio}
                  className="accent-bg text-white dark:text-[#070D0C] px-5 py-2 rounded-full text-xs font-bold font-display scale-tap disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  {savingBio && (
                    <i className="fa-solid fa-circle-notch fa-spin mr-1" />
                  )}
                  <span>{t('save')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  )
}