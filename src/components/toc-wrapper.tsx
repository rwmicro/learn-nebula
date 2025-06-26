import { generateTOC } from "@/hooks/generateTOC"
import TOC from "./toc"

export default async function TOCWrapper({ file }: { file: string }) {
  const toc = await generateTOC(file)
  if (toc) {
    return <TOC toc={toc} />
  }
  return null
}