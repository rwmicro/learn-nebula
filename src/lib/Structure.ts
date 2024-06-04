import path from "path";
import fs from "fs/promises";

export type FileNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
};

export async function getDirectoryStructure(
  dirPath: string
): Promise<FileNode[]> {
  const dirEntries = await fs.readdir(dirPath, { withFileTypes: true });

  const structure = await Promise.all(
    dirEntries.map(async (entry) => {
      const res = path.resolve(dirPath, entry.name);
      if (entry.isDirectory()) {
        return {
          name: entry.name,
          path: res,
          type: "directory",
          children: await getDirectoryStructure(res),
        } as FileNode;
      } else {
        return {
          name: entry.name,
          path: res,
          type: "file",
        } as FileNode;
      }
    })
  );
  return structure;
}
