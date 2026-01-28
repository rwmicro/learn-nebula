import { generateTOC } from "@/hooks/generateTOC"
import { getRecentlyUpdated, getTrendingTags } from "@/lib/toc-data"
import TOC from "./toc"

export default async function TOCWrapper({ file }: { file: string }) {
  const toc = await generateTOC(file)
  
  if (toc) {
    // Fetch dynamic data
    const recentFiles = await getRecentlyUpdated(5)
    const trendingTags = await getTrendingTags(8)
    
    return <TOC toc={toc} recentFiles={recentFiles} trendingTags={trendingTags} />
  }
  return null
}