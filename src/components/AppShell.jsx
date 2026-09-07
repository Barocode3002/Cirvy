import NavBar from './NavBar'
import Sidebar from './Sidebar'

export default function AppShell({ children, rightSidebar = false }) {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-main)] transition-colors">
      <div className="mx-auto flex max-w-[1440px] gap-8 px-4 py-6 sm:px-6 lg:px-8">
        <Sidebar />
        <div className="min-w-0 flex-1">
          <NavBar />
          {children}
        </div>
        {rightSidebar && <Sidebar side="right" />}
      </div>
    </div>
  )
}

