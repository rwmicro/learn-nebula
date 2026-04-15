import Image from "next/image"
import Link from "next/link"
import Search from "./search"
import { getTreeData } from "@/lib/treeData"
import Hamburger from "./hamburger"
import { KeyboardShortcuts } from "./keyboard-shortcuts"
import { ThemeToggle } from "./theme-toggle"

export default async function Header() {
  const tree = await getTreeData()

  return (
    <header
      id="main-header"
      className="min-h-[4vh] flex justify-between items-center w-full px-3 sm:px-5 md:px-10 lg:px-20 py-2 bg-[var(--c-bg)] border-b border-[var(--c-border)] z-50">
      <div className="flex justify-between items-center md:pl-6 lg:pl-10 min-w-0">
        <Link href="/" className="relative p-2.5 pl-0 pt-3 shrink-0">
          <div>
            <Image
              src="/img/nebula-b.png"
              alt="Nebula.li"
              width={300}
              height={160}
              className="cursor-pointer w-20 sm:w-24 dark:invert"
              priority
            />
          </div>
          <span className="absolute -right-3 top-1 text-[#da3434] text-[9px] font-bold">
            Learn
          </span>
        </Link>
      </div>
      <div className="flex gap-1.5 sm:gap-2 md:gap-3 items-center">
        <Search tree={tree} hideTrigger />
        <div className="hidden sm:block">
          <KeyboardShortcuts />
        </div>
        <ThemeToggle />
        <div className="block lg:hidden">
          <Hamburger treeData={tree} />
        </div>
      </div>
    </header>
  )
}
