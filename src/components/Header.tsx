import Image from "next/image"
import Link from "next/link"
import Search from "./Search"
import { getTreeData } from "@/lib/treeData"

export default async function Header() {
  const tree = await getTreeData()

  return (
    <header className="h-[7vh] flex flex-row justify-between items-center w-full px-20 py-2 bg-[#F9F9F9] border-b border-[#E0E0E0]">
      <div className="flex justify-between items-center pl-10">
        <Link href="/" className="relative p-2.5 pl-0 pt-3">
          <div>
            <Image
              src="/img/nebula-b.png"
              alt="Nebula.li"
              width={300}
              height={160}
              className="cursor-pointer w-28"
            />
          </div>
          <span className="absolute -right-4 top-0 text-[#da3434] text-[10px] font-bold">
            Learn
          </span>
        </Link>
      </div>
      <div className="flex gap-5">
        <Search tree={tree} />
      </div>
    </header>
  )
}
