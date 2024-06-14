"use client";
import Link from "next/link";
import Image from "next/image";
import { FileNode } from "../lib/types";
import { usePathname } from "next/navigation";
import TreeNode from "./TreeNode";
import { useEffect, useState } from "react";

export default function Structure({ tree }: { tree: FileNode[] }) {
  const location = usePathname();
  const path = decodeURIComponent(location);
  const pathSplits: string[] = path.split("/");
  pathSplits.shift();

  const [mobile, setMobile] = useState(true);
  const [showUI, setShowUI] = useState(false);

  useEffect(() => {
    setMobile(window.innerWidth < 1024);
    setShowUI(window.innerWidth > 1024);
    document.documentElement.classList.remove("dark");
  }, []);

  function toggleTheme(isDark: boolean) {
    localStorage.theme = isDark ? "dark" : "light";
    console.log("Theme set to", isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }

  return (
    <>
      <div className="min-w-14 xl:w-14 flex xl:flex-col justify-between items-center align-middle h-14 xl:h-screen border-r px-5 xl:px-0 xl:py-5 border-neutral-300 bg-neutral-200 text-neutral-600">
        <div
          className="p-1 bg-gray-300 hover:bg-neutral-400 rounded-md w-fit h-fit"
          onClick={() => {
            setShowUI(!showUI);
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 64 64"
            width="24px"
            height="24px"
          >
            <path d="M51 46c1.104 0 2 .895 2 2 0 1.105-.896 2-2 2-.601 0-37.399 0-38 0-1.104 0-2-.895-2-2 0-1.105.896-2 2-2C13.601 46 50.399 46 51 46zM51 30c1.104 0 2 .895 2 2 0 1.105-.896 2-2 2-.601 0-37.399 0-38 0-1.104 0-2-.895-2-2 0-1.105.896-2 2-2C13.601 30 50.399 30 51 30zM51 14c1.104 0 2 .895 2 2 0 1.105-.896 2-2 2-.601 0-37.399 0-38 0-1.104 0-2-.895-2-2 0-1.105.896-2 2-2C13.601 14 50.399 14 51 14z" />
          </svg>
        </div>
        <button
          type="button"
          onClick={() => {
            toggleTheme(false);
          }}
          className="dark:hidden block group flex items-center text-gray-600 hover:text-blue-600 font-medium dark:text-neutral-400 dark:hover:text-neutral-500"
        >
          <svg
            className="flex-shrink-0 size-5"
            xmlns="http://www.w3.org/2000/svg"
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>
          </svg>
        </button>
        <button
          type="button"
          onClick={() => {
            toggleTheme(true);
          }}
          className="dark:block hidden group flex items-center text-gray-600 hover:text-blue-600 font-medium dark:text-neutral-400 dark:hover:text-neutral-500"
        >
          <svg
            className="flex-shrink-0 size-5"
            xmlns="http://www.w3.org/2000/svg"
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="4"></circle>
            <path d="M12 2v2"></path>
            <path d="M12 20v2"></path>
            <path d="m4.93 4.93 1.41 1.41"></path>
            <path d="m17.66 17.66 1.41 1.41"></path>
            <path d="M2 12h2"></path>
            <path d="M20 12h2"></path>
            <path d="m6.34 17.66-1.41 1.41"></path>
            <path d="m19.07 4.93-1.41 1.41"></path>
          </svg>
        </button>
      </div>
      {showUI && (
        <div
          className={`${
            mobile && showUI
              ? "absolute top-14 xl:top-0 xl:left-12 w-full h-full"
              : ""
          }hidden xl:block xl:w-1/4 h-screen border-r overflow-scroll border-neutral-300 p-4 text-[14px] bg-neutral-200 text-neutral-600`}
        >
          <div className="flex justify-between items-center pb-3 pl-10">
            <Link
              href="https://www.nebula.li"
              target="_blank"
              rel="noopener noreferrer"
              className="relative p-2.5 pl-0 pt-3"
            >
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
            {mobile && (
              <Image
                src="/img/close.svg"
                alt="Close UI"
                width={52}
                height={52}
                className="cursor-pointer w-6 h-6"
                onClick={() => {
                  setShowUI(false);
                }}
              />
            )}
          </div>
          {tree.map((node: FileNode) => {
            return (
              <TreeNode key={node.path} node={node} pathName={pathSplits} />
            );
          })}
        </div>
      )}
    </>
  );
}
