// src/components/NavBar.jsx
// Persistent Header and Bottom Navigation matching the refined Cirvy design system.

import { NavLink } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useUI } from '@/contexts/UIContext'
import SettingsModal from './SettingsModal'
import CirvyLogo from './CirvyLogo'

export default function NavBar() {
  const { user, profile } = useAuth()
  const { lang, dark, toggleLang, toggleTheme, t } = useUI()

  const currentHandle = profile?.username || user?.user_metadata?.username
  const profilePath = currentHandle ? `/${currentHandle}` : (user ? `/profile/${user.id}` : '/login')

  const navItems = [
    { to: '/feed', icon: 'fa-solid fa-house', label: t('navFeed') },
    { to: '/friends', icon: 'fa-solid fa-user-group', label: t('navFriends') },
    { to: '/search', icon: 'fa-solid fa-magnifying-glass', label: t('navSearch') },
    { to: profilePath, icon: 'fa-solid fa-user', label: t('navProfile') },
  ]

  return (
    <>
      {/* ============ STICKY HEADER ============ */}
      <header className="sticky top-0 z-30 glass px-4 py-3 flex items-center justify-between w-full transition-all duration-300 md:hidden border-b border-[var(--card-border)]">
        <NavLink to="/feed" className="flex items-center gap-2.5 group">
          <CirvyLogo variant="icon" size={30} showGlow />
          <div className="leading-tight">
            <div className="flex items-center gap-1.5">
              <p className="font-display font-extrabold text-base text-[var(--text-main)] tracking-tight group-hover:text-[#4A7A8C] transition-colors">
                {t('brand')}
              </p>
              <span className="w-1.5 h-1.5 rounded-full bg-[#8FBC94]" />
            </div>
            <p className="text-[9px] font-mono text-sub tracking-wider uppercase">
              {t('shieldLabel')}
            </p>
          </div>
        </NavLink>

        <div className="flex items-center gap-2">
          {/* Language Toggle */}
          <button
            onClick={toggleLang}
            className="w-8 h-8 rounded-full field flex items-center justify-center text-xs font-mono font-bold scale-tap transition-all hover:border-[#4A7A8C] cursor-pointer"
            title="Toggle Language"
          >
            <span>{lang === 'ar' ? 'EN' : 'AR'}</span>
          </button>
          <button
            onClick={toggleTheme}
            className="w-8 h-8 rounded-full field flex items-center justify-center text-xs font-semibold scale-tap transition-all hover:border-[#4A7A8C] cursor-pointer"
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <i className={`fa-solid ${dark ? 'fa-sun' : 'fa-moon'} text-xs text-sub`} />
          </button>
        </div>
      </header>

      {/* ============ BOTTOM NAV ============ */}
      <nav
        id="bottomNav"
        className="fixed bottom-0 left-0 right-0 glass border-t border-[var(--card-border)] px-3 pt-2 z-30 shadow-lg md:hidden"
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)',
        }}
      >
        <div className="grid grid-cols-4">
          {navItems.map(({ to, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `nav-item flex flex-col items-center gap-1 py-1.5 rounded-xl scale-tap transition-all cursor-pointer ${
                  isActive
                    ? 'active text-[var(--text-main)] font-bold'
                    : 'text-sub hover:text-[var(--text-main)]'
                }`
              }
            >
              <i className={`${icon} nav-ico text-[17px]`} />
              <span className="nav-dot w-1 h-1 rounded-full bg-[#8FBC94]" />
              <span className="text-[10px] font-medium leading-none">{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Settings Modal (Global) */}
      <SettingsModal />
    </>
  )
}
