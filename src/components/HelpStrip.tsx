import { useId, useState } from 'react'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Popover from '@mui/material/Popover'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import CloseIcon from '@mui/icons-material/Close'

interface HelpStripProps {
  pageKey: string
  text: string
}

/** Page explanations are available on request, without pushing the work down. */
export default function HelpStrip({ pageKey, text }: HelpStripProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null)
  const id = `${pageKey}-help-${useId()}`
  return (
    <>
      <Button
        size="small"
        startIcon={<InfoOutlinedIcon fontSize="small" />}
        onClick={(event) => setAnchorEl(event.currentTarget)}
        aria-haspopup="dialog"
        aria-expanded={Boolean(anchorEl)}
        aria-controls={anchorEl ? id : undefined}
        sx={{ minHeight: 44, flexShrink: 0, alignSelf: 'flex-start' }}
      >
        Help
      </Button>
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { maxWidth: 360, p: 2 } } }}
      >
        <Stack id={id} role="dialog" aria-label="Page help" direction="row" spacing={1}>
          <Typography variant="body2">{text}</Typography>
          <IconButton
            aria-label="Close help"
            onClick={() => setAnchorEl(null)}
            sx={{ alignSelf: 'flex-start', minWidth: 44, minHeight: 44 }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Popover>
    </>
  )
}
