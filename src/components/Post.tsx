import { MDXRemote } from "next-mdx-remote/rsc";
import { components as MarkdownComponents } from "./Markdown";

export function Post({ children }: {children: string}) {
  return (
    <MDXRemote
      source={children}
      options={{
        mdxOptions: {},
      }}
      components={MarkdownComponents}
    />
  );
}
