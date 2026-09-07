// src/pages/FriendRequestsPage.jsx
// Friends & Requests management matching the HTML design.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import AppShell from '@/components/AppShell'
import { useUI } from '@/contexts/UIContext'
import { usePresence } from '@/contexts/PresenceContext'
import { UserCheck, UserPlus, Users } from 'lucide-react'

export default function FriendRequests() {
  const { t, showToast } = useUI()
  const { isOnline } = usePresence()
  const [tab, setTab] = useState('friends')
  const [requests, setRequests] = useState([])
  const [friends, setFriends] = useState([])
  const [loading, setLoading] = useState(true)
  const [actioningId, setActioningId] = useState(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { data: reqData } = await supabase
      .from('friendships')
      .select('id, requester:requester_id(id, username, display_name, avatar_url)')
      .eq('addressee_id', user.id)
      .eq('status', 'pending')
    setRequests(reqData || [])

    const { data: friendData } = await supabase
      .from('friendships')
      .select(
        'id, requester:requester_id(id, username, display_name, avatar_url), addressee:addressee_id(id, username, display_name, avatar_url)'
      )
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .eq('status', 'accepted')

    const friendList = (friendData || []).map((f) =>
      f.requester.id === user.id ? f.addressee : f.requester
    )
    setFriends(friendList)
    setLoading(false)
  }

  async function accept(friendshipId) {
    setActioningId(friendshipId)
    await supabase.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId)
    setActioningId(null)
    showToast(t('friendAccepted'))
    loadData()
  }

  async function reject(friendshipId) {
    setActioningId(friendshipId)
    await supabase.from('friendships').delete().eq('id', friendshipId)
    setActioningId(null)
    showToast(t('friendDeclined'))
    loadData()
  }

  return (
    <AppShell>
      <main className="flex-1 overflow-y-auto px-4 py-6 view max-w-2xl mx-auto">
        <h2 className="font-display font-bold text-xl mb-4 text-[var(--text-main)]">
          {t('friendsTitle')}
        </h2>

        {/* Tab Headers with tab-underline */}
        <div
          className="flex gap-6 mb-5 border-b border-[var(--card-border)]"
        >
          <button
            onClick={() => setTab('friends')}
            className={`tab-underline pb-3 text-sm font-semibold scale-tap cursor-pointer transition-colors ${
              tab === 'friends' ? 'active text-[var(--text-main)]' : 'text-sub'
            }`}
          >
            <span>{t('friendsTab')}</span>
            {friends.length > 0 && (
              <span className="ms-1.5 text-xs font-mono opacity-80">({friends.length})</span>
            )}
          </button>
          <button
            onClick={() => setTab('requests')}
            className={`tab-underline pb-3 text-sm font-semibold scale-tap cursor-pointer transition-colors ${
              tab === 'requests' ? 'active text-[var(--text-main)]' : 'text-sub'
            }`}
          >
            <span>{t('requestsTab')}</span>
            {requests.length > 0 && (
              <span className="ms-1.5 px-2 py-0.5 rounded-full accent-bg text-[#F5F7F8] dark:text-[#10181C] text-[10px] font-mono font-bold">
                {requests.length}
              </span>
            )}
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="glass rounded-2xl p-3.5 flex items-center gap-3 animate-pulse border border-[var(--card-border)]"
              >
                <div className="w-11 h-11 rounded-full bg-[var(--card-border)]" />
                <div className="flex-1 space-y-2">
                  <div className="w-28 h-4 rounded bg-[var(--card-border)]" />
                  <div className="w-20 h-3 rounded bg-[var(--card-border)]" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Friends Panel */}
            {tab === 'friends' && (
              <div className="space-y-2.5">
                {friends.length === 0 ? (
                  <div className="glass rounded-3xl p-10 text-center border border-[var(--card-border)]">
                    <Users size={28} className="text-sub mx-auto mb-2 opacity-60" />
                    <p className="font-bold text-sm text-[var(--text-main)]">No connections yet</p>
                    <p className="text-xs text-sub mt-1">
                      Search for people you know to build your private circle.
                    </p>
                    <Link
                      to="/search"
                      className="inline-flex items-center gap-1.5 accent-bg text-[#F5F7F8] dark:text-[#10181C] text-xs font-bold px-4 py-2 rounded-full mt-4 scale-tap"
                    >
                      <UserPlus size={13} />
                      <span>Find friends</span>
                    </Link>
                  </div>
                ) : (
                  friends.map((f) => {
                    const online = isOnline(f.id)
                    const friendPath = f.username ? `/${f.username}` : `/${f.id}`
                    return (
                      <div
                        key={f.id}
                        className="glass rounded-2xl p-3 flex items-center gap-3 transition scale-tap border border-[var(--card-border)]"
                      >
                        <Link to={friendPath} className="relative">
                          <img
                            src={
                              f.avatar_url ||
                              `https://ui-avatars.com/api/?name=${encodeURIComponent(
                                f.display_name || 'U'
                              )}&background=4A7A8C&color=fff`
                            }
                            alt=""
                            className="w-11 h-11 rounded-full object-cover ring-2 ring-[var(--card-border)]"
                          />
                          {/* Real online/offline presence indicator */}
                          <span
                            className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full ring-2 ring-[var(--bg)] ${
                              online
                                ? 'bg-[#8FBC94] shadow-[0_0_6px_rgba(143,188,148,0.8)]'
                                : 'bg-[#8FA6B0] opacity-50'
                            }`}
                            title={online ? 'Online' : 'Offline'}
                          />
                        </Link>
                        <div className="flex-1 min-w-0">
                          <Link
                            to={friendPath}
                            className="text-sm font-bold truncate hover:underline block text-[var(--text-main)]"
                          >
                            {f.display_name}
                          </Link>
                          <p className="text-xs text-sub truncate">
                            <span className="font-mono">@{f.username}</span> · {online ? (
                              <span className="text-[#8FBC94] font-medium">Online</span>
                            ) : (
                              'Offline'
                            )}
                          </p>
                        </div>
                        <Link
                          to={friendPath}
                          className="field h-8 px-3 rounded-full flex items-center justify-center text-xs font-semibold text-sub hover:text-[var(--text-main)] scale-tap transition"
                        >
                          View
                        </Link>
                      </div>
                    )
                  })
                )}
              </div>
            )}

            {/* Requests Panel */}
            {tab === 'requests' && (
              <div className="space-y-2.5">
                {requests.length === 0 ? (
                  <div className="glass rounded-3xl p-10 text-center border border-[var(--card-border)]">
                    <UserCheck size={28} className="text-sub mx-auto mb-2 opacity-60" />
                    <p className="font-bold text-sm text-[var(--text-main)]">All caught up</p>
                    <p className="text-xs text-sub mt-1">No pending friend requests right now.</p>
                  </div>
                ) : (
                  requests.map((r) => {
                    const reqPath = r.requester.username ? `/${r.requester.username}` : `/${r.requester.id}`
                    return (
                    <div
                      key={r.id}
                      className="glass rounded-2xl p-3 flex items-center gap-3 transition border border-[var(--card-border)]"
                    >
                      <Link to={reqPath}>
                        <img
                          src={
                            r.requester.avatar_url ||
                            `https://ui-avatars.com/api/?name=${encodeURIComponent(
                              r.requester.display_name || 'U'
                            )}&background=4A7A8C&color=fff`
                          }
                          alt=""
                          className="w-11 h-11 rounded-full object-cover ring-2 ring-[var(--card-border)]"
                        />
                      </Link>
                      <div className="flex-1 min-w-0">
                        <Link
                          to={reqPath}
                          className="text-sm font-bold truncate hover:underline block text-[var(--text-main)]"
                        >
                          {r.requester.display_name}
                        </Link>
                        <p className="text-xs text-sub truncate font-mono">
                          @{r.requester.username}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => accept(r.id)}
                          disabled={actioningId === r.id}
                          className="accent-bg text-[#F5F7F8] dark:text-[#10181C] text-xs font-bold px-3.5 py-1.5 rounded-full scale-tap transition disabled:opacity-50 cursor-pointer"
                        >
                          {t('accept')}
                        </button>
                        <button
                          onClick={() => reject(r.id)}
                          disabled={actioningId === r.id}
                          className="field text-xs font-semibold px-3 py-1.5 rounded-full scale-tap transition disabled:opacity-50 cursor-pointer"
                        >
                          {t('decline')}
                        </button>
                      </div>
                    </div>
                  )})
                )}
              </div>
            )}
          </>
        )}
      </main>
    </AppShell>
  )
}