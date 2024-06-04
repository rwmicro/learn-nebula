"use client";
import { MDXRemote, MDXRemoteSerializeResult } from "next-mdx-remote/rsc";
import { components as MarkdownComponents } from "./Markdown";

type PostProps = {
  children: string;
};

export function Post({ children }: PostProps) {
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
