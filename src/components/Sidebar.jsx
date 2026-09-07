import { useEffect, useState } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { Home, Plus, Search, Settings, User, Users, MessageSquare } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useUI } from '@/contexts/UIContext'
import { usePresence } from '@/contexts/PresenceContext'
import { supabase } from '@/lib/supabase'
import CirvyLogo from './CirvyLogo'

const navItems = [
  { to: '/feed', label: 'Home', icon: Home },
  { to: '/search', label: 'Search', icon: Search },  
  { to: '/messages', label: 'Chats (Coming soon)', icon: MessageSquare },
  { to: '/friends', label: 'Friends', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/profile', label: 'Profile', icon: User },
]

function avatarFor(person, fallback = 'User') {
  return (
    person?.avatar_url ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(
      person?.display_name || fallback
    )}&background=4A7A8C&color=F5F7F8`
  )
}

export default function Sidebar({ side = 'left' }) {
  const { user, profile } = useAuth()
  const { dark, setShowSettings, toggleTheme } = useUI()
  const { isOnline } = usePresence()
  const [people, setPeople] = useState([])

  async function loadPeople() {
    if (!user) return
    if (side === 'left') {
      const { data: friendships } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
        .eq('status', 'accepted')
      const ids = (friendships || []).map((friendship) =>
        friendship.requester_id === user.id
          ? friendship.addressee_id
          : friendship.requester_id
      )
      if (!ids.length) return setPeople([])
      const { data } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', ids)
        .limit(6)
      setPeople(data || [])
    } else {
      const { data } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .neq('id', user.id)
        .limit(4)
      setPeople(data || [])
    }
  }

  useEffect(() => {
    if (user) loadPeople()
  }, [user, side])

  if (side === 'right') {
    return (
      <aside className="hidden w-72 shrink-0 lg:block">
        <div className="sticky top-8 rounded-3xl glass p-5 shadow-glass border border-[var(--card-border)]">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-sub">
                Discover
              </p>
              <h2 className="mt-0.5 text-base font-bold text-[var(--text-main)]">
                People You May Know
              </h2>
            </div>
            <Users size={16} className="text-sub" />
          </div>
          <div className="space-y-3">
            {people.map((person) => {
              const personPath = person.username ? `/${person.username}` : `/${person.id}`
              return (
                <div key={person.id} className="flex items-center gap-3">
                  <Link to={personPath} className="relative shrink-0">
                    <img
                      src={avatarFor(person)}
                      alt=""
                      className="h-9 w-9 rounded-full object-cover ring-2 ring-[var(--card-border)]"
                    />
                    <span
                      className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-1 ring-[var(--bg)] ${
                        isOnline(person.id)
                          ? 'bg-[#8FBC94]'
                          : 'bg-[#8FA6B0] opacity-40'
                      }`}
                    />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link
                      to={personPath}
                      className="block truncate text-xs font-bold text-[var(--text-main)] hover:underline"
                    >
                      {person.display_name || 'User'}
                    </Link>
                    <p className="truncate text-[11px] text-sub">
                      @{person.username || 'user'}
                    </p>
                  </div>
                  <Link
                    to={personPath}
                    aria-label={`View ${person.display_name || 'friend'}`}
                    className="rounded-full field p-2 text-sub hover:text-[var(--text-main)] hover:border-[#4A7A8C] scale-tap"
                  >
                    <Plus size={13} />
                  </Link>
                </div>
              )
            })}
          </div>
          <Link
            to="/search"
            className="mt-5 flex items-center justify-center gap-1.5 text-xs font-bold text-sub hover:text-[var(--text-main)]"
          >
            <Search size={13} />
            <span>Find more friends</span>
          </Link>
        </div>
      </aside>
    )
  }

  const currentHandle = profile?.username || user?.user_metadata?.username
  const profilePath = currentHandle ? `/${currentHandle}` : (user ? `/profile/${user.id}` : '/login')

  return (
    <aside className="hidden w-60 shrink-0 md:block">
      <div className="sticky top-8">
        <Link to="/feed" className="mb-8 flex items-center gap-3 group">
          <CirvyLogo variant="icon" size={32} showGlow />
          <div>
            <p className="text-lg font-black tracking-tight text-[var(--text-main)] group-hover:text-[#4A7A8C] transition-colors">
              Cirvy
            </p>
            <p className="text-[10px] font-mono font-bold uppercase tracking-[0.14em] text-sub">
              Private Circle
            </p>
          </div>
        </Link>
        <nav className="space-y-1">
          {navItems.map(({ to, label, icon: Icon }) =>
            label === 'Settings' ? (
              <button
                key={label}
                type="button"
                onClick={() => setShowSettings(true)}
                className="flex w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-left text-xs font-semibold text-sub hover:text-[var(--text-main)] hover:bg-[var(--card-border)]/40 transition scale-tap cursor-pointer"
              >
                <Icon size={16} />
                <span>{label}</span>
              </button>
            ) : (
              <NavLink
                key={label}
                to={to === '/profile' ? profilePath : to}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-2xl px-4 py-2.5 text-xs font-semibold transition scale-tap ${
                    isActive
                      ? 'accent-bg text-[#F5F7F8] dark:text-[#10181C] shadow-sm'
                      : 'text-sub hover:text-[var(--text-main)] hover:bg-[var(--card-border)]/40'
                  }`
                }
              >
                <Icon size={16} />
                <span>{label}</span>
              </NavLink>
            )
          )}
        </nav>
        <button
          type="button"
          onClick={toggleTheme}
          className="mt-3 flex w-full items-center gap-3 rounded-2xl field px-4 py-2.5 text-left text-xs font-semibold text-sub hover:text-[var(--text-main)] transition scale-tap cursor-pointer"
        >
          <i
            className={`fa-solid ${dark ? 'fa-sun' : 'fa-moon'} w-[16px] text-center text-sub`}
          />
          <span>{dark ? 'Light mode' : 'Dark mode'}</span>
        </button>

        {/* Real online/offline presence for sidebar friends list */}
        <div className="mt-8 border-t border-[var(--card-border)] pt-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-bold font-mono uppercase tracking-wider text-sub">
              My Friends
            </h2>
            {people.length > 0 && (
              <span className="rounded-full bg-[#8FBC94]/20 text-[#8FBC94] border border-[#8FBC94]/30 px-2 py-0.5 text-[10px] font-mono font-bold">
                {people.length}
              </span>
            )}
          </div>
          {people.length === 0 ? (
            <p className="text-[11px] text-sub">No friends connected yet.</p>
          ) : (
            <div className="space-y-2.5">
              {people.map((person) => {
                const online = isOnline(person.id)
                const personPath = person.username ? `/${person.username}` : `/${person.id}`
                return (
                  <Link
                    key={person.id}
                    to={personPath}
                    className="flex items-center gap-2.5 rounded-xl p-1 hover:bg-[var(--card-border)]/30 transition group"
                  >
                    <div className="relative">
                      <img
                        src={avatarFor(person)}
                        alt=""
                        className="h-7 w-7 rounded-full object-cover ring-1 ring-[var(--card-border)]"
                      />
                      <span
                        className={`absolute bottom-0 right-0 h-2 w-2 rounded-full ring-1 ring-[var(--bg)] ${
                          online ? 'bg-[#8FBC94]' : 'bg-[#8FA6B0] opacity-40'
                        }`}
                      />
                    </div>
                    <span className="truncate text-xs font-medium text-[var(--text-main)] group-hover:underline">
                      {person.display_name || 'User'}
                    </span>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}