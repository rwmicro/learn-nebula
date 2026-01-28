interface Heading {
  text: string
  level: number
}

export async function generateTOC(content: string): Promise<Heading[]> {
  const headings: Heading[] = []
  const lines = content ? content.split("\n") : []

  // Regular expression to match markdown headings (not in code blocks)
  const headingRegex = /^(#{1,6})\s+(.+)$/
  let inCodeBlock = false

  // Remove both bold (**) and italic (*) markdown from headings
  const cleanHeadingRegex = /(\*\*|\*)/g

  function cleanHeadingText(text: string): string {
    return text.replace(cleanHeadingRegex, "")
  }

  for (const line of lines) {
    // Check for code block delimiters
    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock
      continue
    }

    // Skip if we're inside a code block
    if (inCodeBlock) continue

    const match = line.match(headingRegex)
    if (match) {
      const level = match[1].length
      const text_raw = match[2].trim()
      const cleanedText = cleanHeadingText(text_raw)
      // Remove any extra markdown formatting from the heading text
      const sanitizedText = cleanedText.replace(/[*_`]/g, "").trim()
      // Remove any extra spaces
      const text = sanitizedText.replace(/\s+/g, " ")
      // Add the heading to the list
      headings.push({
        text,
        level,
      })
    }
  }

  if (headings.length === 0) {
    return []
  }
  return headings
}
