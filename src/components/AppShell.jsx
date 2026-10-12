import NavBar from './NavBar'
import Sidebar from './Sidebar'

export default function AppShell({ children, rightSidebar = false, noPadding = false }) {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-main)] transition-colors">
      <div className="flex min-h-screen w-full">
        <Sidebar />
        <div className={`min-w-0 flex-1 ${noPadding ? 'h-screen overflow-hidden flex flex-col' : 'px-4 py-6 sm:px-6 xl:px-10'}`}>
          <NavBar />
          {children}
        </div>
        {rightSidebar && <Sidebar side="right" />}
      </div>
    </div>
  )
}

