"use client";
import { sanitizePath } from "@/hooks/tools";
import { FileNode } from "@/lib/types";
import Link from "next/link";
import { useEffect, useState } from "react";

function searchStack(tree: FileNode[], stack: FileNode[] = []): FileNode[] {
  tree.forEach((node: FileNode) => {
    if (node.type === "directory" && node.children) {
      searchStack(node.children, stack);
    }
    if (node.type === "file") {
      stack.push(node);
    }
  });
  return stack;
}

function searchArticle(tree: FileNode[], search: string): FileNode[] {
  const stack: FileNode[] = [];
  
  tree.forEach((node: FileNode) => {
    const lowerCasePath = node.path.toLowerCase();
    const lowerCaseSearch = search.toLowerCase();

    if (lowerCasePath.includes(lowerCaseSearch) || search === "") {
      stack.push(node);
    }
  });

  return stack;
}

function destroyComponent() {
  return () => {
    document.getElementById("search")?.remove();
  };
}

export default function Search({ tree }: { tree: FileNode[] }) {
  const defaultStack = searchStack(tree);
  const [search, setSearch] = useState<string>("");
  const [filteredTree, setFilteredTree] = useState<FileNode[]>(defaultStack);
  console.log(defaultStack);
  useEffect(() => {
    setFilteredTree(searchArticle(defaultStack, search));
  }, [search]);
  return (
    <>
      <div id="search">
        <div
          className="w-full h-full fixed top-0 left-0 bg-neutral-300 bg-opacity-50 z-50"
          onClick={destroyComponent()}
        ></div>
        <div className="fixed top-10 w-[42rem] left-1/2 transform pb-4 -translate-x-1/2 p-2 bg-white rounded-xl border z-[51] flex flex-col overflow-hidden">
          <div className="flex justify-between items-center border-b border-gray-200 px-4">
          <input
            className="w-full h-10 outline-none "
            type="text"
            placeholder="Please enter the file name you want to open..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="p-1.5 text-neutral-800 bg-neutral-100 font-mono text-xs border rounded-lg" onClick={destroyComponent()}>
            Esc
          </button>
          </div>
          <div className="flex flex-col px-3 text-[15px] text-neutral-800">
            {filteredTree.slice(0, 8).map((node: FileNode, number) => {
              return (
                <Link
                  className="p-2 rounded border-gray-300 hover:bg-neutral-300"
                  key={number}
                  href={encodeURIComponent(
                    node.path.replace(/\.(md|mdx|pdf)$/, "")
                  )}
                >
                  {sanitizePath(node.path)}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
