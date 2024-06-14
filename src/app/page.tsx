import { getPostBySlug } from "@/lib/posts";
import { Post } from "@/lib/types";
import { notFound } from "next/navigation";
import FileTree from "@/components/Structure";
import { getTreeFrom } from "@/lib/posts";
import { MDXRemote } from "next-mdx-remote-client/rsc";
import { components as MarkdownComponents } from "../components/Markdown";

async function getData(): Promise<Post | null> {
  try {
    return getPostBySlug(encodeURIComponent("Garden of Knowledge"));
  } catch (error) {
    return null;
  }
}

export default async function Index() {
  const post = await getData();
  if (!post) return notFound();
  const tree = await getTreeFrom("pensine");
  const path = post.path.replace(/\//g, " / ");
  return (
    <>
      <div
        className={`flex flex-col xl:flex-row w-full ${
          post.type === "pdf" ? "w-full" : "xl:w-5/6"
        }`}
      >        <FileTree tree={tree} />
        <div className="w-full p-4 pt-0 px-7 xl:px-20 pb-5 overflow-scroll h-screen">
        <h1 className="text-sm text-center pt-3 text-[#404040]">{path}</h1>
          <h1 className="text-3xl font-medium pt-2 pb-4">{post.title}</h1>
          <MDXRemote
            source={post.body}
            components={MarkdownComponents}
          />
        </div>
      </div>
    </>
  );
}
