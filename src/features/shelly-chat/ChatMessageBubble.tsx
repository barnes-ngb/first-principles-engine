import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { ChatMessage } from '../../core/types'

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp)
  const now = new Date()
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()

  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (isToday) return time

  const month = date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  return `${month}, ${time}`
}

function renderContent(text: string) {
  return text.split('\n').map((line, i) => {
    if (!line.trim()) return <br key={i} />

    // Bullet points
    if (line.match(/^[-*]\s/)) {
      const bulletText = line.replace(/^[-*]\s/, '')
      return (
        <Typography key={i} variant="body2" component="p" sx={{ pl: 2, my: 0.25 }}>
          &bull; {applyBold(bulletText)}
        </Typography>
      )
    }

    return (
      <Typography key={i} variant="body2" component="p" sx={{ my: 0.25 }}>
        {applyBold(line)}
      </Typography>
    )
  })
}

function applyBold(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i}>{part.slice(2, -2)}</strong>
      )
    }
    return part
  })
}

interface ChatMessageBubbleProps {
  message: ChatMessage
}

export default function ChatMessageBubble({ message }: ChatMessageBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        mb: 1.5,
      }}
    >
      <Box sx={{ maxWidth: '85%' }}>
        <Box
          sx={{
            px: 2,
            py: 1,
            borderRadius: isUser
              ? '16px 16px 4px 16px'
              : '16px 16px 16px 4px',
            bgcolor: isUser ? 'primary.main' : 'grey.100',
            color: isUser ? 'primary.contrastText' : 'text.primary',
          }}
        >
          {message.imagePrompt && isUser && (
            <Typography variant="caption" sx={{ opacity: 0.8 }}>
              🎨{' '}
            </Typography>
          )}
          {message.imageUrl && (
            <Box
              component="a"
              href={message.imageUrl}
              target="_blank"
              rel="noopener noreferrer"
              sx={{ display: 'block', mb: message.content ? 1 : 0 }}
            >
              <Box
                component="img"
                src={message.imageUrl}
                alt="Generated image"
                sx={{
                  maxWidth: '100%',
                  borderRadius: 1,
                  display: 'block',
                }}
              />
            </Box>
          )}
          {isUser ? (
            <Typography variant="body2">{message.content}</Typography>
          ) : (
            renderContent(message.content)
          )}
        </Box>
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            mt: 0.25,
            px: 1,
            color: 'text.secondary',
            textAlign: isUser ? 'right' : 'left',
          }}
        >
          {formatTimestamp(message.timestamp)}
        </Typography>
      </Box>
    </Box>
  )
}
