export type Post = {
  title: string;
  slug: string;
  date: string;
  description: string;
  body: string;
};

export type FileNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
};
