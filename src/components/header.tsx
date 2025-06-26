import Image from "next/image"
import Link from "next/link"
import Search from "./search"
import { getTreeData } from "@/lib/treeData"
import Hamburger from "./hamburger"

export default async function Header() {
  const tree = await getTreeData()

  return (
    <header
      id="main-header"
      className="min-h-[4vh] flex justify-between items-center w-full px-5 md:px-20 py-2 bg-[#F9F9F9] border-b border-[#E0E0E0] z-50">
      <div className="flex justify-between items-center md:pl-10">
        <Link href="/" className="relative p-2.5 pl-0 pt-3">
          <div>
            <Image
              src="/img/nebula-b.png"
              alt="Nebula.li"
              width={300}
              height={160}
              className="cursor-pointer w-24"
              priority
            />
          </div>
          <span className="absolute -right-3 top-1 text-[#da3434] text-[9px] font-bold">
            Learn
          </span>
        </Link>
      </div>
      <div className="flex gap-5 items-center">
        <div className="hidden sm:flex gap-5">
          <Search tree={tree} />
        </div>
        <div className="block lg:hidden">
          <Hamburger treeData={tree} />
        </div>
      </div>
    </header>
  )
}
