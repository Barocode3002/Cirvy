import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

export default function SidebarRight() {
  const { user } = useAuth()
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) {
      loadSuggestions()
    }
  }, [user])

  async function loadSuggestions() {
    setLoading(true)

    // Get existing friendships to exclude them
    const { data: friendships } = await supabase
      .from('friendships')
      .select('requester_id, addressee_id')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)

    const friendIds = (friendships || []).map((f) =>
      f.requester_id === user.id ? f.addressee_id : f.requester_id
    )

    // Add current user to exclusion list
    const excludeIds = [...friendIds, user.id]

    // Fetch some users
    const { data } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .not('id', 'in', `(${excludeIds.join(',')})`)
      .limit(3)

    setSuggestions(data || [])
    setLoading(false)
  }

  return (
    <aside className="hidden lg:flex flex-col w-72 h-screen sticky top-0 py-6 px-4 shrink-0 overflow-y-auto">
      <div className="glass rounded-2xl p-4 shadow-glass border border-[var(--card-border)]">
        <h3 className="font-display font-bold text-sm text-[var(--text-main)] mb-4">People you may know</h3>

        {loading ? (
          <div className="flex justify-center py-4">
            <i className="fa-solid fa-circle-notch fa-spin text-[var(--accent)]" />
          </div>
        ) : suggestions.length === 0 ? (
          <p className="text-xs text-sub">No suggestions right now.</p>
        ) : (
          <div className="space-y-4">
            {suggestions.map(person => {
              const personPath = person.username ? `/${person.username}` : `/${person.id}`
              return (
                <div key={person.id} className="flex items-center gap-3">
                  <Link to={personPath} className="shrink-0">
                    <img
                      src={person.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(person.display_name || 'U')}&background=00AFA0&color=fff`}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover ring-2 ring-[var(--card-border)]"
                    />
                  </Link>
                  <div className="flex-1 truncate">
                    <Link to={personPath} className="hover:underline">
                      <p className="text-sm font-semibold text-[var(--text-main)] truncate">
                        {person.display_name || 'User'}
                      </p>
                    </Link>
                    <p className="text-xs text-sub truncate font-display">@{person.username}</p>
                  </div>
                  <Link
                    to={personPath}
                    className="shrink-0 text-xs font-semibold text-[var(--accent)] bg-[var(--accent)]/10 hover:bg-[var(--accent)]/20 px-3 py-1.5 rounded-full transition-colors scale-tap"
                  >
                    View
                  </Link>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </aside>
  )
}
