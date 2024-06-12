import path from "path";
import fs from "fs";
import fsPromises from "fs/promises";
import { Post, FileNode } from "./types";

const postsDirectory = path.join(process.cwd(), "pensine");

export async function getTreeFrom(dirPath: string): Promise<FileNode[]> {
  const dirEntries = await fsPromises.readdir(dirPath, { withFileTypes: true });

  const structure = await Promise.all(
    dirEntries.map(async (entry) => {
      if (entry.name.startsWith(".")) return null;
      const res = path.join(dirPath, entry.name);
      const finalPath = path.relative(postsDirectory, res);
      if (entry.isDirectory()) {
        return {
          name: entry.name,
          path: finalPath,
          type: "directory",
          children: await getTreeFrom(res),
        } as FileNode;
      } else if (
        entry.isFile() &&
        (entry.name.endsWith(".md") ||
          entry.name.endsWith(".mdx") ||
          entry.name.endsWith(".pdf"))
      ) {
        return {
          name: entry.name,
          path: finalPath,
          type: "file",
        } as FileNode;
      } else {
        return null;
      }
    })
  );

  return structure.filter(Boolean) as FileNode[];
}

export async function getPostSlugs() {
  const structure = await getTreeFrom(postsDirectory);

  const filePaths: any = [];

  function traverse(node: FileNode) {
    if (node.type === "file") {
      filePaths.push(node.path);
    } else if (node.type === "directory" && node.children) {
      node.children.forEach(traverse);
    }
  }

  structure.forEach(traverse);
  return filePaths.map((filePath: any) => ({
    params: { slug: encodeURIComponent(filePath.replace(/\.(md|mdx|pdf)$/, "")) },
  }));
}

export async function getPostBySlug(encodedSlug: string): Promise<Post | null> {
  const slug = decodeURIComponent(encodedSlug);
  const fullPath = path.join(postsDirectory, `${slug}.md`);
  const fullPathMdx = path.join(postsDirectory, `${slug}.mdx`);
  const fullPathPDF = path.join(postsDirectory, `${slug}.pdf`);
  const title = slug.split("/")[slug.split("/").length - 1];
  let filePath = "";
  let type = "";

  if (fs.existsSync(fullPath)) {
    filePath = fullPath;
    type = "md"
  } else if (fs.existsSync(fullPathMdx)) {
    filePath = fullPathMdx;
    type = "mdx"
  } else if (fs.existsSync(fullPathPDF)){
    filePath = fullPathPDF;
    type = "pdf"
  }
    else {
    return null;
  }
  const fileContents = fs.readFileSync(filePath, "utf8");

  return Promise.resolve({
    title: title,
    body: fileContents,
    path: slug,
    type: type,
  }) as unknown as Post;
}
