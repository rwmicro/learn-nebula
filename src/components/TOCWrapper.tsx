import { generateTOC } from "@/hooks/generateTOC"
import TOC from "./TOC"

export default async function TOCWrapper({ file }: { file: string }) {
  const toc = await generateTOC(file)
  return <TOC toc={toc} />
} 