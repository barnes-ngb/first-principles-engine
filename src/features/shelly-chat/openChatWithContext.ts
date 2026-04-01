import { addDoc } from 'firebase/firestore'
import { shellyChatThreadsCollection, shellyChatMessagesCollection } from '../../core/firebase/firestore'

export const openChatWithContext = async (
  familyId: string,
  navigate: (path: string) => void,
  context: {
    source: 'sparkle' | 'planner' | 'evaluation' | 'general'
    itemTitle?: string
    weekTheme?: string
    childId?: string
    initialMessage: string
  },
) => {
  // 1. Create thread with context metadata
  const threadRef = await addDoc(shellyChatThreadsCollection(familyId), {
    title: context.itemTitle || context.initialMessage.slice(0, 60),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messageCount: 1,
    lastMessagePreview: context.initialMessage.slice(0, 100),
    context: {
      source: context.source,
      itemTitle: context.itemTitle,
      weekTheme: context.weekTheme,
      childId: context.childId,
    },
    archived: false,
  })

  // 2. Add the initial user message
  await addDoc(shellyChatMessagesCollection(familyId, threadRef.id), {
    role: 'user',
    content: context.initialMessage,
    timestamp: new Date().toISOString(),
  })

  // 3. Navigate to chat with thread ID
  navigate(`/chat?thread=${threadRef.id}`)
}
