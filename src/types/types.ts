export type Post = {
  title: string;
  path: string;
  body: string;
  type: typeof SUPPORTED_EXTENSIONS[number];
};

export type FileNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
};

export const IMAGE_EXTENSIONS = ["png", "PNG", "jpg", "JPG", "jpeg", "JPEG"]

export const SUPPORTED_EXTENSIONS = [
  "md",
  "mdx", 
  "pdf",
  ...IMAGE_EXTENSIONS
] as const