"use client"

import dynamic from "next/dynamic"

const Assistant = dynamic(() => import("./Assistant"), { ssr: false })

export default function AssistantLoader() {
  return <Assistant />
}
