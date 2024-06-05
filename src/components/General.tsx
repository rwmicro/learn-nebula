"use client";
import { useState } from "react";
import FileTree from "./Structure";

type FileNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
};

export default function General({ tree }: { tree: FileNode[] }) {

  return (
      <><FileTree tree={tree} /><div className="w-5/6 h-screen p-4 absolute right-0">
      <h1 className="text-2xl font-bold">Welcome to Pensine</h1>
      <p>This is a simple example of a file tree structure.</p>
    </div></>
  );
}
