import { getPostBySlug, getPostSlugs } from "@/lib/posts";
import { Post } from "@/lib/types";
import { notFound } from "next/navigation";
import FileTree from "@/components/Structure";
import { getTreeFrom } from "@/lib/posts";
import { MDXRemote, MDXRemoteOptions } from "next-mdx-remote-client/rsc";
import { components as MarkdownComponents } from "../../components/Markdown";
import remarkGfm from "remark-gfm";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeSlug from "rehype-slug";
import rehypeToc from "@jsdevtools/rehype-toc";
import rehypePrettyCode from "rehype-pretty-code";

export async function generateStaticParams() {
  const paths = await getPostSlugs();
  return paths.map((path: any) => ({ slug: path.params.slug }));
}

async function getData(slug: string): Promise<Post | null> {
  try {
    return getPostBySlug(slug);
  } catch (error) {
    return null;
  }
}

const customizeTOC = (toc: any): any | null => {
  try {
    const { children } = toc;
    const childrenOfChildren = children?.[0]?.children;
    if (!children?.length || !childrenOfChildren?.length) return null;
  } catch (e) {}
  return {
    type: "element",
    tagName: "div",
    properties: {
      className:
        "toc h-screen hidden xl:block w-1/6 fixed top-0 right-0 border-l overflow-scroll border-neutral-300 p-4 text-[14px] bg-neutral-200 text-neutral-600",
    },
    children: [
      {
        type: "element",
        tagName: "p",
        properties: { className: "title" },
        children: [{ type: "text", value: "Table of Contents" }],
      },
      ...(toc.children || []),
    ],
  };
};
const options: MDXRemoteOptions = {
  mdxOptions: {
    remarkPlugins: [remarkGfm],
    rehypePlugins: [
      rehypeSlug,
      rehypeAutolinkHeadings,
      [rehypeToc, { customizeTOC }],
      rehypePrettyCode,
    ],
  },
  parseFrontmatter: false,
};

export default async function PostPage({
  params,
}: {
  params: { slug: string };
}) {
  if (!params.slug) return notFound();
  const post = await getData(params.slug);
  if (!post) return notFound();
  const tree = await getTreeFrom("pensine");
  const path = post.path.replace(/\//g, " / ");
  return (
    <>
      <div
        className={`flex flex-col xl:flex-row w-full ${
          post.type === "pdf" ? "w-full" : "xl:w-5/6"
        }`}
      >
        <FileTree tree={tree} />
        <div className="w-full p-4 pt-0 px-7 xl:px-20 pb-5 overflow-scroll h-screen">
          <h1 className="text-sm text-center pt-3 text-[#404040]">{path}</h1>
          {post.type === "pdf" && (
            <>
              <div className="h-full w-full bg-neutral-600 mt-2">
                {(() => {
                  const pdfDataUrl = `data:application/pdf;base64,${Buffer.from(
                    post.body
                  ).toString("base64")}`;

                  return (
                    <embed
                      src={`${pdfDataUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                      type="application/pdf"
                      className="w-full h-full"
                    />
                  );
                })()}
              </div>
            </>
          )}

          {(post.type === "mdx" || post.type === "md") && (
            <>
              <h1 className="text-3xl font-medium pt-2 pb-4">{post.title}</h1>
              <MDXRemote
                source={post.body}
                options={options}
                components={MarkdownComponents}
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}
