import { Send } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function EmptyChatState() {
  const navigate = useNavigate()

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[var(--bg)]">
      <div className="w-20 h-20 rounded-full accent-soft-bg flex items-center justify-center text-[var(--accent)] mb-4 border border-[var(--accent)]/30 shadow-sm">
        <Send size={32} className="ml-1" />
      </div>

      <h2 className="font-display font-extrabold text-xl mb-1.5 text-[var(--text-main)]">
        Your messages
      </h2>

      <p className="text-xs text-sub max-w-xs font-body mb-6 leading-relaxed">
        Send private photos and messages to a friend or group.
      </p>

      <button
        type="button"
        onClick={() => navigate('/search')}
        className="accent-bg text-white dark:text-[#070D0C] px-5 py-2.5 rounded-full text-xs font-bold font-display scale-tap transition cursor-pointer hover:opacity-90 shadow-sm"
      >
        Send message
      </button>
    </div>
  )
}
