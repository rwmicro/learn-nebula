"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { FileNode } from "../lib/types";

const TreeNode: React.FC<{ node: FileNode }> = ({ node }) => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleOpen = () => {
    setIsOpen(!isOpen);
  };

  return (
    <div>
      {node.type === "directory" ? (
        <div>
          <div
            onClick={toggleOpen}
            className="pointer flex items-center hover:bg-neutral-300 rounded p-0.5"
          >
            <span>
              {isOpen ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="stroke-neutral-400 p-0.5"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="stroke-neutral-400 -rotate-90 p-0.5"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              )}
            </span>
            {node.name}
          </div>
          {isOpen && node.children && (
            <div className="ml-3 pl-2 border-l border-neutral-300">
              {node.children.map((childNode) => (
                <TreeNode key={childNode.path} node={childNode} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <Link href={encodeURIComponent(node.path.replace(/\.(md|mdx)$/, ""))}>
          <div className="pointer pl-6 p-1 hover:bg-neutral-300 rounded">
            {node.name.replace(/\.(md|mdx)$/, "")}
          </div>
        </Link>
      )}
    </div>
  );
};

const FileTree: React.FC<{ tree: FileNode[] }> = ({ tree }) => {
  return (
    <div className="w-1/6 h-screen fixed border-r border-neutral-300 p-4 text-[14px] bg-neutral-200 text-neutral-600">
      <div className="pl-20 flex items-center justify-between">
        <Link
          href="https://www.nebula.li"
          target="_blank"
          rel="noopener noreferrer"
          className="relative p-2.5"
        >
          <div>
            <Image
              src="/img/nebula-b.png"
              alt="Nebula.li"
              width={300}
              height={160}
              className="cursor-pointer md:w-28"
            />
          </div>
          <span className="absolute -right-4 top-0 text-[#da3434] text-[10px] font-bold">
            Learn
          </span>
        </Link>
      </div>
      {tree.map((node: FileNode) => (
        <TreeNode key={node.path} node={node} />
      ))}
    </div>
  );
};

export default FileTree;
