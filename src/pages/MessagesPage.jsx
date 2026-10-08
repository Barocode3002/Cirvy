// src/pages/MessagesPage.jsx

import { useParams, useNavigate } from 'react-router-dom'
import AppShell from '@/components/AppShell'
import MessagesListPage from './MessagesListPage'
import ChatPage from './ChatPage'
import EmptyChatState from '@/components/EmptyChatState'

export default function MessagesPage() {
  const { chatId, friendId } = useParams()
  const activeChatId = chatId || friendId
  const navigate = useNavigate()

  return (
    <AppShell>
      <div className="flex-1 flex overflow-hidden h-[calc(100dvh-5rem)] md:h-[calc(100vh-4rem)] w-full">
        {/* Left Pane: Conversation List */}
        <div className={`w-full md:w-[380px] shrink-0 border-r border-[var(--card-border)] overflow-y-auto ${activeChatId ? 'hidden md:block' : 'block'}`}>
          <MessagesListPage 
            isEmbedded 
            selectedChatId={activeChatId} 
            onSelectChat={(id) => navigate(`/messages/${id}`)} 
          />
        </div>

        {/* Right Pane: Active Chat or Empty State */}
        <div className={`flex-1 flex flex-col min-w-0 bg-[var(--bg)] ${!activeChatId ? 'hidden md:flex' : 'flex'}`}>
          {activeChatId ? (
            <ChatPage isSplitView friendId={activeChatId} key={activeChatId} />
          ) : (
            <EmptyChatState />
          )}
        </div>
      </div>
    </AppShell>
  )
}
