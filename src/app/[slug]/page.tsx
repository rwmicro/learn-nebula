import { getPostBySlug, getPostSlugs } from "@/lib/posts";
import { Post } from "@/lib/types";
import { notFound } from "next/navigation";
import FileTree from "@/components/Structure";
import { Post as PostComponent } from "@/components/Post";
import { getAllFilesAndDirectories } from "@/lib/posts";

export async function generateStaticParams() {
  const paths = await getPostSlugs();
  return paths.map((path:any) => ({ slug: path.params.slug }));
}

async function getData(slug: string): Promise<Post | null> {
  try {
    return getPostBySlug(slug);
  } catch (error) {
    return null;
  }
}

const PostPage = async ({ params }: { params: { slug: string } }) => {
  if (!params.slug) return notFound();
  const post = await getData(params.slug);
  if (!post) return notFound();
  const tree = await getAllFilesAndDirectories("articles");
  return (
    <>
      <FileTree tree={tree} />
      <div className="w-5/6 h-screen p-4 absolute right-0">
        <h1 className="text-2xl font-bold">{post.title}</h1>
        <PostComponent children={post.body} />
        
      </div>
    </>
  );
};

export default PostPage;
