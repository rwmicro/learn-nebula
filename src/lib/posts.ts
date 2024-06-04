import matter from "gray-matter";
import fs from "fs";
import path from "path";

export type Post = {
  title: string;
  slug: string;
  date: string;
  description: string;
  body: string;
};

export function getPost(file: string): Post | null {
  try {
    const filePath = path.join(file);
    const fileContent = fs.readFileSync(filePath, "utf8");
    const { data, content } = matter(fileContent);

    return {
      title: data.title,
      slug: data.slug,
      date: data.date,
      description: data.description,
      body: content,
    };
  } catch (error) {
    return null;
  }
}
