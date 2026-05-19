"use client"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { vscDarkPlus, vs } from "react-syntax-highlighter/dist/esm/styles/prism"
import { useTheme } from "next-themes"

export default function CodeBlock({ language, code }: { language: string; code: string }) {
  const { resolvedTheme } = useTheme()
  const syntaxStyle = resolvedTheme === "dark" ? vscDarkPlus : vs
  return (
    <SyntaxHighlighter
      language={language}
      style={syntaxStyle}
      customStyle={{ margin: 0, borderRadius: "0", padding: "1.5rem", background: "var(--code-block-bg)" }}
      showLineNumbers={false}
    >
      {code}
    </SyntaxHighlighter>
  )
}
