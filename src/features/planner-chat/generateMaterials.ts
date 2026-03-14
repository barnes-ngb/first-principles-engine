import type { DraftDayPlan, SkillSnapshot } from '../../core/types/domain'

export interface GeneratedMaterial {
  dayName: string
  html: string
}

export function buildMaterialsPrompt(
  day: DraftDayPlan,
  childName: string,
  snapshot: SkillSnapshot | null,
  theme?: string,
): string {
  const items = day.items.filter((i) => i.accepted && !i.isAppBlock)

  return `Generate printable learning materials for ${childName}'s ${day.day} activities.

Activities for ${day.day}:
${items.map((i) => `- ${i.title} (${i.estimatedMinutes}m, ${i.subjectBucket})`).join('\n')}

${snapshot?.prioritySkills?.length ? `Current skill focus: ${snapshot.prioritySkills.map((s) => `${s.label} (${s.level})`).join(', ')}` : ''}
${theme ? `This week's theme: ${theme}` : ''}

For each non-app activity, generate a printable worksheet or activity sheet. Return ONLY valid HTML (no markdown, no explanation) with these requirements:

1. Use simple, clean HTML with inline CSS for print
2. Include a <style> block with @media print rules
3. Each activity gets its own section with a page-break-before
4. Font: Arial, 14pt for instructions, 18pt for student writing areas
5. Include the child's name and day at the top of each page
6. For MATH activities: generate 6-8 problems at the appropriate level with space for work. Include 1-2 guided examples at the top.
7. For PHONICS/READING activities: generate a word list (8-10 words), sound boxes for blending practice, and 2-3 simple sentences using those words.
8. For COMPREHENSION activities: generate 3-4 questions about the reading, with lined space for answers or narration notes.
9. For WRITING activities: generate a writing prompt with a picture area and 4-6 lined writing spaces.
10. For OTHER activities: generate a simple activity card with instructions and a notes area.

Make it look like a real worksheet a teacher would hand out — not a wall of text. Use borders, boxes, numbered problems, and clear visual separation.

Start the HTML with:
<html><head><style>
  @media print { .page-break { page-break-before: always; } }
  body { font-family: Arial, sans-serif; max-width: 7.5in; margin: 0.5in auto; }
  .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 8px; margin-bottom: 16px; }
  .problem { margin: 12px 0; padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
  .work-space { height: 60px; border-bottom: 1px dashed #ccc; margin: 8px 0; }
  .word-box { display: inline-block; border: 2px solid #333; padding: 8px 16px; margin: 4px; font-size: 18pt; min-width: 80px; text-align: center; }
  .sound-box { display: inline-block; width: 40px; height: 40px; border: 2px solid #333; margin: 2px; text-align: center; line-height: 40px; font-size: 18pt; }
  .line { border-bottom: 1px solid #999; height: 30px; margin: 6px 0; }
</style></head><body>`
}

export function openPrintWindow(html: string): void {
  // Extract HTML from response (may have markdown fences)
  let cleaned = html
  const fenceMatch = cleaned.match(/```html?\s*([\s\S]*?)```/)
  if (fenceMatch) cleaned = fenceMatch[1]

  // If it doesn't start with <html, wrap it
  if (!cleaned.trim().startsWith('<html')) {
    cleaned = `<html><head><style>
  @media print { .page-break { page-break-before: always; } }
  body { font-family: Arial, sans-serif; max-width: 7.5in; margin: 0.5in auto; }
  .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 8px; margin-bottom: 16px; }
</style></head><body>${cleaned}</body></html>`
  }

  const printWindow = window.open('', '_blank')
  if (printWindow) {
    printWindow.document.write(cleaned)
    printWindow.document.close()
    setTimeout(() => printWindow.print(), 500)
  }
}
