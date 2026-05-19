"use client"
import dynamic from "next/dynamic"
import type { Post } from "@/utils/types"

const Content = dynamic(() => import("@/components/content"), { ssr: false })

export default function HomeContentClient({
  post,
  formattedPath,
}: {
  post: Post
  formattedPath: string
}) {
  return <Content post={post} formattedPath={formattedPath} />
}
