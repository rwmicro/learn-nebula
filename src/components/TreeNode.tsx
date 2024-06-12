"use client";
import { FileNode } from "@/lib/types";
import Link from "next/link";
import { useState } from "react";

export default function TreeNode({
  node,
  pathName,
}: {
  node: FileNode;
  pathName: string[];
}) {
  function isNodeOpen() {
    if (pathName.length === 0) return false;
    if (pathName.includes(node.name)) return true;
    return false;
  }
  const [isOpen, setIsOpen] = useState(isNodeOpen());
  return (
    <div className="break-all">
      {node.type === "directory" ? (
        <div>
          <div
            onClick={() => setIsOpen(!isOpen)}
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
                <TreeNode
                  key={childNode.path}
                  node={childNode}
                  pathName={pathName}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <Link href={encodeURIComponent(node.path.replace(/\.(md|mdx|pdf)$/, ""))} className="pointer">
          <div className="pl-6 p-1 hover:bg-neutral-300 rounded">
            {node.name.replace(/\.(md|mdx)$/, "")}
          </div>
        </Link>
      )}
    </div>
  );
}
