import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'

const TEMPLATE_CHIPS: Record<string, string[]> = {
  matching: ['Animals', 'Colors', 'Numbers', 'Characters', 'Foods', 'Vehicles'],
  collecting: ['Characters', 'Weapons', 'Animals', 'Colors', 'Treasures'],
  battle: ['Warriors', 'Monsters', 'Robots', 'Wizards', 'Animals'],
}

const MECHANIC_PROMPTS: Record<string, { title: string; description: string; hint: string }> = {
  matching: {
    title: "What pairs should players find?",
    description: "Name what kinds of things should be on your matching cards! Each one becomes a pair to find.",
    hint: "e.g. dragons, rainbows, robots...",
  },
  collecting: {
    title: "What sets should players collect?",
    description: "Name the sets! Each set will have 3-4 cards to collect. Like 'All the dragons' or 'All the swords'.",
    hint: "e.g. Dragon set, Sword set, Potion set...",
  },
  battle: {
    title: "What should be on your battle cards?",
    description: "Name your battle cards! Characters, creatures, or items. The AI will give each one a power level!",
    hint: "e.g. Dragon King, Robot Warrior, Magic Shield...",
  },
}

interface CardDesignStepProps {
  mechanic: string
  value: string[]
  onChange: (descriptions: string[]) => void
}

export default function CardDesignStep({ mechanic, value, onChange }: CardDesignStepProps) {
  const [customInput, setCustomInput] = useState('')
  const prompts = MECHANIC_PROMPTS[mechanic] ?? MECHANIC_PROMPTS.matching
  const templates = TEMPLATE_CHIPS[mechanic] ?? TEMPLATE_CHIPS.matching

  const maxItems = mechanic === 'matching' ? 12 : mechanic === 'collecting' ? 6 : 24
  const canAdd = value.length < maxItems

  const handleAddCustom = () => {
    const trimmed = customInput.trim()
    if (trimmed && canAdd && !value.includes(trimmed)) {
      onChange([...value, trimmed])
      setCustomInput('')
    }
  }

  const handleAddTemplate = (template: string) => {
    if (canAdd && !value.includes(template)) {
      onChange([...value, template])
    }
  }

  const handleRemove = (index: number) => {
    onChange(value.filter((_, i) => i !== index))
  }

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        {prompts.title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {prompts.description}
      </Typography>

      {/* Template chips */}
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 2 }}>
        {templates.map((template) => (
          <Chip
            key={template}
            label={template}
            onClick={() => handleAddTemplate(template)}
            color={value.includes(template) ? 'primary' : 'default'}
            variant={value.includes(template) ? 'filled' : 'outlined'}
            sx={{ cursor: 'pointer' }}
          />
        ))}
      </Box>

      {/* Custom input */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <TextField
          fullWidth
          size="small"
          placeholder={prompts.hint}
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleAddCustom()
            }
          }}
          disabled={!canAdd}
        />
        <Button
          variant="outlined"
          onClick={handleAddCustom}
          disabled={!canAdd || !customInput.trim()}
          sx={{ minWidth: 44 }}
        >
          <AddIcon />
        </Button>
      </Box>

      {/* Current items */}
      {value.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            Your {mechanic === 'matching' ? 'pairs' : mechanic === 'collecting' ? 'sets' : 'cards'} ({value.length}):
          </Typography>
          {value.map((item, index) => (
            <Box
              key={index}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                p: 1,
                borderRadius: 1,
                bgcolor: 'action.hover',
              }}
            >
              <Typography variant="body2" sx={{ flex: 1, fontWeight: 500 }}>
                {index + 1}. {item}
              </Typography>
              <IconButton size="small" onClick={() => handleRemove(index)} color="error">
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>
          ))}
        </Box>
      )}

      {!canAdd && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          Maximum {maxItems} {mechanic === 'matching' ? 'pairs' : mechanic === 'collecting' ? 'sets' : 'cards'} reached!
        </Typography>
      )}
    </Box>
  )
}
