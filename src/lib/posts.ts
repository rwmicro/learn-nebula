import path from "path";
import fs from "fs";
import fsPromises from "fs/promises";
import matter from "gray-matter";
import { Post, FileNode } from "./types";

const postsDirectory = path.join(process.cwd(), "articles");

export async function getAllFilesAndDirectories(
  dirPath: string
): Promise<FileNode[]> {
  const dirEntries = await fsPromises.readdir(dirPath, { withFileTypes: true });

  const structure = await Promise.all(
    dirEntries.map(async (entry) => {
      const res = path.join(dirPath, entry.name);
      const finalPath = path.relative(postsDirectory, res);
      if (entry.isDirectory()) {
        return {
          name: entry.name,
          path: finalPath,
          type: "directory",
          children: await getAllFilesAndDirectories(res),
        } as FileNode;
      } else if (
        entry.isFile() &&
        (entry.name.endsWith(".md") || entry.name.endsWith(".mdx"))
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
  const structure = await getAllFilesAndDirectories(postsDirectory);

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
    params: { slug: encodeURIComponent(filePath.replace(/\.(md|mdx)$/, "")) },
  }));
}

export async function getPostBySlug(encodedSlug: string): Promise<Post | null> {
  const slug = decodeURIComponent(encodedSlug);
  const fullPath = path.join(postsDirectory, `${slug}.md`);
  const fullPathMdx = path.join(postsDirectory, `${slug}.mdx`);

  let filePath = "";

  if (fs.existsSync(fullPath)) {
    filePath = fullPath;
  } else if (fs.existsSync(fullPathMdx)) {
    filePath = fullPathMdx;
  } else {
    return null;
  }

  const fileContents = fs.readFileSync(filePath, "utf8");
  const { data, content } = matter(fileContents);

  return Promise.resolve({
    title: data.title,
    slug: data.slug,
    date: data.date,
    description: data.description,
    body: content,
  });
}
