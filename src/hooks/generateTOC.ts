interface Heading {
  text: string;
  level: number;
}

export async function generateTOC(content: string): Promise<Heading[]> {
  const headings: Heading[] = [];
  const lines = content ? content.split('\n') : [];
  
  // Regular expression to match markdown headings (not in code blocks)
  const headingRegex = /^(#{1,6})\s+(.+)$/;
  let inCodeBlock = false;

  for (const line of lines) {
    // Check for code block delimiters
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    // Skip if we're inside a code block
    if (inCodeBlock) continue;

    const match = line.match(headingRegex);
    if (match) {
      const level = match[1].length;
      const text = match[2].trim();
      headings.push({
        text,
        level,
      });
    }
  }

  return headings;
}