import { Link } from 'react-router-dom'
import AppShell from '@/components/AppShell'
import { MessageSquareDashed } from 'lucide-react'

export default function ChatPage() {
  return (
    <AppShell>
      <main className="flex-1 overflow-y-auto px-4 py-6 view max-w-2xl mx-auto flex flex-col items-center justify-center min-h-[80vh]">
        
        <div className="glass rounded-3xl p-10 text-center border border-[var(--card-border)] flex flex-col items-center max-w-sm w-full">
          
          <MessageSquareDashed size={48} className="text-[#8FBC94] mb-4 opacity-80" />
          
          <h2 className="font-display font-bold text-xl text-[var(--text-main)] mb-2">
            Chat Coming Soon
          </h2>
          
          <p className="text-sm text-sub mb-8">
            It's underconstruction... Just keep waiting 🔥
          </p>

          <Link
            to="/feed"
            className="accent-bg text-[#F5F7F8] dark:text-[#10181C] text-sm font-bold px-6 py-2.5 rounded-full scale-tap transition"
          >
            Back to Feed
          </Link>

        </div>
      </main>
    </AppShell>
  )
}