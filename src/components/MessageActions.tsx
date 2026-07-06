import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import DownloadIcon from '@mui/icons-material/Download'

import type { MessageExportMeta } from '../core/utils/messageExport'
import {
  buildMessageFilename,
  buildMessageMarkdownFile,
  copyMarkdown,
  downloadMarkdownFile,
} from '../core/utils/messageExport'

interface MessageActionsProps {
  /** The message's raw Markdown source (model text), copied/downloaded verbatim. */
  markdown: string
  /** Filename + header metadata. */
  meta: MessageExportMeta
  /** Toast callback — the host page owns the Snackbar. */
  onNotify: (message: string) => void
}

/**
 * Per-assistant-message actions (FEAT-59): copy the message as Markdown and
 * download it as a real `.md` file. Small, unobtrusive icon affordances; the
 * host page shows a toast via {@link MessageActionsProps.onNotify}. Zero infra —
 * copy uses the clipboard, download is a client-side Blob + anchor.
 */
export default function MessageActions({ markdown, meta, onNotify }: MessageActionsProps) {
  const handleCopy = async () => {
    const ok = await copyMarkdown(markdown)
    onNotify(ok ? 'Copied as Markdown' : "Couldn't copy — try again")
  }

  const handleDownload = () => {
    downloadMarkdownFile(
      buildMessageFilename(markdown, meta),
      buildMessageMarkdownFile(markdown, meta),
    )
    onNotify('Downloaded .md')
  }

  return (
    <Box sx={{ display: 'flex', gap: 0.25, mt: 0.25 }}>
      <Tooltip title="Copy as Markdown">
        <IconButton
          size="small"
          onClick={handleCopy}
          aria-label="Copy message as Markdown"
          sx={{ color: 'text.secondary', p: 0.25 }}
        >
          <ContentCopyIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
      <Tooltip title="Download as .md">
        <IconButton
          size="small"
          onClick={handleDownload}
          aria-label="Download message as Markdown file"
          sx={{ color: 'text.secondary', p: 0.25 }}
        >
          <DownloadIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
    </Box>
  )
}
