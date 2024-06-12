
export type Post = {
  title: string;
  path: string;
  body: string;
  type: "mdx" | "md" | "pdf";
};

export type FileNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
};
