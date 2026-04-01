import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { ShellyChatMessage } from '../../core/types'

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

const markdownComponents: Components = {
  h1: ({ children }) => <Typography variant="subtitle1" fontWeight="bold" gutterBottom>{children}</Typography>,
  h2: ({ children }) => <Typography variant="subtitle2" fontWeight="bold" gutterBottom>{children}</Typography>,
  h3: ({ children }) => <Typography variant="subtitle2" fontWeight="bold" gutterBottom>{children}</Typography>,
  p: ({ children }) => <Typography variant="body2" sx={{ mb: 1 }}>{children}</Typography>,
  li: ({ children }) => <Typography variant="body2" component="li">{children}</Typography>,
  code: ({ children, className }) => {
    const isBlock = className?.includes('language-')
    return isBlock
      ? <Box component="pre" sx={{ bgcolor: 'grey.100', p: 1, borderRadius: 1, overflowX: 'auto', fontSize: '0.8rem' }}><code>{children}</code></Box>
      : <Box component="code" sx={{ bgcolor: 'grey.200', px: 0.5, borderRadius: 0.5, fontSize: '0.85em' }}>{children}</Box>
  },
}

function renderImage(url: string, alt: string) {
  return (
    <Box
      component="a"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      sx={{ display: 'block', mb: 1 }}
    >
      <Box
        component="img"
        src={url}
        alt={alt}
        sx={{
          maxWidth: '100%',
          borderRadius: 1,
          display: 'block',
        }}
      />
    </Box>
  )
}

interface ChatMessageBubbleProps {
  message: ShellyChatMessage
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
          {/* Image prompt indicator */}
          {message.imagePrompt && isUser && (
            <Typography variant="caption" sx={{ opacity: 0.8 }}>
              🎨{' '}
            </Typography>
          )}
          {/* Uploaded image with action badge */}
          {message.uploadedImageUrl && isUser && (
            <Box sx={{ mb: 1 }}>
              <Typography variant="caption" sx={{ opacity: 0.8, display: 'block', mb: 0.5 }}>
                {message.imageAction === 'analyze'
                  ? '📷 Asking about image...'
                  : message.imageAction === 'transform'
                    ? '🎨 Using as inspiration...'
                    : '📎 Attached image'}
              </Typography>
              {renderImage(message.uploadedImageUrl, 'Uploaded image')}
            </Box>
          )}
          {/* Generated/AI image */}
          {message.imageUrl && renderImage(message.imageUrl, 'Generated image')}
          {/* Message content */}
          {isUser ? (
            <Typography variant="body2">{message.content}</Typography>
          ) : (
            <ReactMarkdown components={markdownComponents}>
              {message.content}
            </ReactMarkdown>
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
