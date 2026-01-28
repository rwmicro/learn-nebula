import Image from "next/image"
import Link from "next/link"
import Search from "./search"
import { getTreeData } from "@/lib/treeData"
import Hamburger from "./hamburger"
import { ThemeToggle } from "./theme-toggle"
import { KeyboardShortcuts } from "./keyboard-shortcuts"

export default async function Header() {
  const tree = await getTreeData()

  return (
    <header
      id="main-header"
      className="min-h-[4vh] flex justify-between items-center w-full px-5 md:px-20 py-2 bg-[#F9F9F9] dark:bg-[#121212] border-b border-[#E0E0E0] dark:border-[#2a2a2a] z-50">
      <div className="flex justify-between items-center md:pl-10">
        <Link href="/" className="relative p-2.5 pl-0 pt-3">
          <div>
            <Image
              src="/img/nebula-b.png"
              alt="Nebula.li"
              width={300}
              height={160}
              className="cursor-pointer w-24 dark:invert"
              priority
            />
          </div>
          <span className="absolute -right-3 top-1 text-[#da3434] text-[9px] font-bold">
            Learn
          </span>
        </Link>
      </div>
      <div className="flex gap-2 sm:gap-3 items-center">
        <Search tree={tree} hideTrigger />
        <KeyboardShortcuts />
        <ThemeToggle />
        <div className="block lg:hidden">
          <Hamburger treeData={tree} />
        </div>
      </div>
    </header>
  )
}
