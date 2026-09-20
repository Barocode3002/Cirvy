// src/pages/SearchPage.jsx
// Privacy-first Search page querying Supabase profiles with zero tracking.

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import AppShell from '@/components/AppShell'
import { useUI } from '@/contexts/UIContext'
import { usePresence } from '@/contexts/PresenceContext'
import { Search, Shield, User } from 'lucide-react'

export default function SearchPage() {
  const { t } = useUI()
  const { isOnline } = usePresence()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)

  async function fetchUsers(search) {
    const term = search.trim()
    if (!term) {
      setResults([])
      setLoading(false)
      return
    }

    setLoading(true)
    let req = supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .limit(20)

    req = req.or(`username.ilike.%${term}%,display_name.ilike.%${term}%`)

    const { data } = await req
    setResults(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchUsers(query)
  }, [query])

  return (
    <AppShell>
      <main className="flex-1 overflow-y-auto px-4 py-6 view max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-bold text-xl text-[var(--text-main)]">
            {t('searchTitle')}
          </h2>
          <div className="flex items-center gap-1.5 text-[11px] font-display text-sub">
            <Shield size={13} className="text-[#8FBC94]" />
            <span>Zero-tracking search</span>
          </div>
        </div>

        <div className="relative mb-5">
          <Search
            size={16}
            className="absolute top-1/2 -translate-y-1/2 text-sub left-4 rtl:left-auto rtl:right-4"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="field w-full rounded-2xl py-3.5 pl-11 pr-4 rtl:pl-4 rtl:pr-11 text-sm outline-none focus:border-[#4A7A8C]"
            placeholder={t('searchPlaceholder')}
          />
        </div>

        <div className="space-y-2.5">
          {loading ? (
            <div className="space-y-2.5">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="glass rounded-2xl p-3 flex items-center gap-3 animate-pulse border border-[var(--card-border)]"
                >
                  <div className="w-11 h-11 rounded-full bg-[var(--card-border)]" />
                  <div className="flex-1 space-y-2">
                    <div className="w-24 h-4 rounded bg-[var(--card-border)]" />
                    <div className="w-16 h-3 rounded bg-[var(--card-border)]" />
                  </div>
                </div>
              ))}
            </div>
          ) : results.length === 0 ? (
            <div className="glass rounded-3xl p-10 text-center border border-[var(--card-border)]">
              <User size={28} className="text-sub mx-auto mb-2 opacity-60" />
              <p className="text-xs text-sub">
                {query.trim() ? t('noResults') : 'Type a name or username to search privately.'}
              </p>
            </div>
          ) : (
            results.map((u) => {
              const online = isOnline(u.id)
              const userPath = u.username ? `/${u.username}` : `/${u.id}`
              return (
                <div
                  key={u.id}
                  className="glass rounded-2xl p-3 flex items-center gap-3 transition scale-tap border border-[var(--card-border)]"
                >
                  <Link to={userPath} className="relative">
                    <img
                      src={
                        u.avatar_url ||
                        `https://ui-avatars.com/api/?name=${encodeURIComponent(
                          u.display_name || 'User'
                        )}&background=4A7A8C&color=fff`
                      }
                      alt=""
                      className="w-11 h-11 rounded-full object-cover ring-2 ring-[var(--card-border)]"
                    />
                    <span
                      className={`absolute bottom-0 right-0 w-3 h-3 rounded-full ring-2 ring-[var(--bg)] ${online
                          ? 'bg-[#8FBC94] shadow-[0_0_6px_rgba(143,188,148,0.8)]'
                          : 'bg-[#8FA6B0] opacity-50'
                        }`}
                    />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link
                      to={userPath}
                      className="text-sm font-bold truncate flex items-center gap-1.5 text-[var(--text-main)] hover:underline"
                    >
                      <span>{u.display_name}</span>
                      <i
                        className="fa-solid fa-badge-check text-[11px]"
                        style={{ color: '#8FBC94' }}
                      />
                    </Link>
                    <p className="text-xs text-sub truncate font-display">@{u.username}</p>
                  </div>
                  <Link
                    to={userPath}
                    className="accent-bg text-[#F5F7F8] dark:text-[#10181C] text-xs font-bold px-3.5 py-1.5 rounded-full scale-tap transition"
                  >
                    {t('view')}
                  </Link>
                </div>
              )
            })
          )}
        </div>
      </main>
    </AppShell>
  )
}
