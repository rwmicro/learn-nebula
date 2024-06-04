"use client";
import { useState } from "react";
import Structure from "../components/Structure";
import View from "../components/View";
import { FileNode } from "../lib/Structure";

export default function General({ tree }) {
  const [file, setFileState] = useState<FileNode>(null);

  return (
    <>
      <div className="flex">
        <Structure tree={tree} setFile={setFileState} />
        <View file={file} />
      </div>
    </>
  );
}
