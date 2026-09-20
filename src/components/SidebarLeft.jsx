import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useUI } from '@/contexts/UIContext'
import { supabase } from '@/lib/supabase'
import CirvyLogo from './CirvyLogo'

export default function SidebarLeft() {
  const { user, profile } = useAuth()
  const { t } = useUI()
  const [friends, setFriends] = useState([])

  useEffect(() => {
    if (user) {
      loadFriends()
    }
  }, [user])

  async function loadFriends() {
    // Fetch accepted friend IDs
    const { data: friendships } = await supabase
      .from('friendships')
      .select('requester_id, addressee_id')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .eq('status', 'accepted')

    const friendIds = (friendships || []).map((f) =>
      f.requester_id === user.id ? f.addressee_id : f.requester_id
    )

    if (friendIds.length > 0) {
      const { data } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', friendIds)
        .limit(5)

      setFriends(data || [])
    }
  }

  const currentHandle = profile?.username || user?.user_metadata?.username
  const profilePath = currentHandle ? `/${currentHandle}` : (user ? `/profile/${user.id}` : '/login')

  const navItems = [
    { to: '/feed', icon: 'fa-solid fa-house', label: t('navFeed') || 'Home' },
    { to: '/friends', icon: 'fa-solid fa-user-group', label: t('navFriends') || 'Friends' },
    { to: '/search', icon: 'fa-solid fa-magnifying-glass', label: t('navSearch') || 'Explore' },
    { to: profilePath, icon: 'fa-solid fa-user', label: t('navProfile') || 'Profile' },
  ]

  return (
    <aside className="hidden md:flex flex-col w-64 h-screen sticky top-0 py-6 px-4 shrink-0 overflow-y-auto">
      {/* Brand */}
      <div className="mb-8 px-2">
        <NavLink to="/feed" className="flex items-center gap-3 group">
          <CirvyLogo variant="icon" size={32} showGlow />
          <div className="leading-tight">
            <div className="flex items-center gap-1.5">
              <p className="font-display font-extrabold text-[17px] text-[#2E3B42] dark:text-[#F5F7F8] tracking-tight group-hover:text-[#4A7A8C] transition-colors">
                {t('brand') || 'Cirvy'}
              </p>
            </div>
            <p className="text-[10px] font-display text-[#677A85] tracking-wider uppercase">
              {t('shieldLabel') || 'Private'}
            </p>
          </div>
        </NavLink>
      </div>

      {/* Navigation */}
      <nav className="space-y-1 mb-8">
        {navItems.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-4 px-4 py-3 rounded-2xl transition-all font-medium scale-tap ${isActive
                ? 'bg-[#F5F7F8] text-[#4A7A8C] shadow-sm'
                : 'text-[#677A85] hover:bg-[#F5F7F8] hover:text-[#2E3B42]'
              }`
            }
          >
            <i className={`${icon} text-lg w-5 text-center`} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* My Friends Module */}
      <div className="px-2">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-bold text-sm text-[#2E3B42] dark:text-[#F5F7F8]">My Friends</h3>
          {friends.length > 0 && (
            <span className="bg-[#4A7A8C] text-[#F5F7F8] text-[10px] font-bold px-2 py-0.5 rounded-full">
              {friends.length}
            </span>
          )}
        </div>

        {friends.length === 0 ? (
          <p className="text-xs text-[#677A85]">No friends yet.</p>
        ) : (
          <div className="space-y-3">
            {friends.map(friend => {
              const friendPath = friend.username ? `/${friend.username}` : `/${friend.id}`
              return (
                <NavLink to={friendPath} key={friend.id} className="flex items-center gap-3 group">
                  <img
                    src={friend.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(friend.display_name || 'U')}&background=4A7A8C&color=fff`}
                    alt=""
                    className="w-8 h-8 rounded-full object-cover"
                  />
                  <div className="flex-1 truncate">
                    <p className="text-xs font-semibold text-[#2E3B42] dark:text-[#F5F7F8] group-hover:text-[#4A7A8C] truncate">
                      {friend.display_name || 'User'}
                    </p>
                  </div>
                </NavLink>
              )
            })}
          </div>
        )}
      </div>
    </aside>
  )
}
