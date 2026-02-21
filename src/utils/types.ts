import { SUPPORTED_EXTENSIONS } from "./constants";

export type Post = {
  lastModified: string;
  date: string;
  excerpt: string;
  title: string;
  path: string;
  body: string;
  type: typeof SUPPORTED_EXTENSIONS[number];
  metadata?: Record<string, string | string[]>;
};

export type FileNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
};