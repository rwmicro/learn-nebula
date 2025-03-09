"use client"

import Image from "next/image"
import sideBar from "public/img/sidebar.svg"
import { useState } from "react"

interface Heading {
  text: string
  level: number
}

const TOCLink = ({ heading }: { heading: Heading }) => {
  const id = heading.text.toLowerCase().replace(/\s+/g, "-")
  const isActive =
    typeof window !== "undefined" && window.location.hash === `#${id}`
  return (
    <a
      href={`#${id}`}
      className={`block hover:text-[#09090B] font-medium transition-colors text-sm p-0.5 rounded-md ${
        isActive ? "text-[#09090B]" : "text-[#71717A]"
      } `}
      style={{ marginLeft: `${heading.level * 0.6}rem` }}
    >
      {heading.text}
    </a>
  )
}

export default function TOC({ toc }: { toc: Heading[] }) {
  const [isOpen, setIsOpen] = useState(true)

  return (
    <div
      className={`hidden xl:block border-l bg-[#F4F4F5] dark:bg-[#27272A] overflow-scroll min-h-[93vh] transition-all duration-300 ${
        !isOpen ? "w-16" : "w-[32rem] p-5"
      }`}
    >
      <div className="flex items-center justify-between w-full pb-2">
        {isOpen && <span className="font-s">Table of Contents</span>}
        <Image
          src={sideBar}
          alt="Sidebar Right"
          width={45}
          height={45}
          className={`w-10 h-10 hover:bg-[#e7e7e9] p-2 rounded cursor-pointer transition-transform ${
            !isOpen ? "rotate-0 mt-5 mx-auto" : "rotate-180"
          }`}
          onClick={() => setIsOpen(!isOpen)}
        />
      </div>
      {isOpen && (
        <ul className="space-y-2">
          {toc.map((heading: Heading, index: number) => (
            <TOCLink key={index} heading={heading} />
          ))}
        </ul>
      )}
    </div>
  )
}
