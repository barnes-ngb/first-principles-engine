import Autocomplete from '@mui/material/Autocomplete'
import Chip from '@mui/material/Chip'
import TextField from '@mui/material/TextField'

import { SKILL_TAG_CATALOG, suggestTagsForSubject } from '../core/types/skillTags'
import type { SkillTag } from '../core/types/domain'

interface SkillTagPickerProps {
  value: SkillTag[]
  onChange: (tags: SkillTag[]) => void
  /** If provided, puts suggested tags first in the dropdown. */
  subjectHint?: string
  label?: string
  size?: 'small' | 'medium'
  disabled?: boolean
}

export default function SkillTagPicker({
  value,
  onChange,
  subjectHint,
  label = 'Skill Tags',
  size = 'small',
  disabled = false,
}: SkillTagPickerProps) {
  // Build options: subject-suggested first, then the rest
  const suggested = subjectHint ? suggestTagsForSubject(subjectHint) : []
  const suggestedSet = new Set(suggested)
  const options = [
    ...suggested,
    ...SKILL_TAG_CATALOG.map((d) => d.tag).filter((t) => !suggestedSet.has(t)),
  ]

  const tagLabelMap = Object.fromEntries(
    SKILL_TAG_CATALOG.map((d) => [d.tag, d.label]),
  )

  return (
    <Autocomplete
      multiple
      size={size}
      disabled={disabled}
      options={options}
      value={value}
      onChange={(_e, newValue) => onChange(newValue)}
      getOptionLabel={(option) => tagLabelMap[option] ?? option}
      groupBy={(option) => (suggestedSet.has(option) ? 'Suggested' : 'All Tags')}
      renderTags={(selected, getTagProps) =>
        selected.map((tag, index) => {
          const { key, ...restProps } = getTagProps({ index })
          return (
            <Chip
              key={key}
              label={tagLabelMap[tag] ?? tag}
              size="small"
              variant="outlined"
              color="info"
              {...restProps}
            />
          )
        })
      }
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder="Add skill tag..."
        />
      )}
    />
  )
}
