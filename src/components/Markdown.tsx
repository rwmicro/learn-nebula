import { MDXComponents } from "mdx/types";

export const components: MDXComponents = {
  a: ({ children, ...props }) => {
    return (
      <a
        {...props}
        className="underline text-blue-600 duration-100"
        target="_blank"
      >
        {children}
      </a>
    );
  },
  h1: ({ children, ...props }) => {
    return (
      <h1
        {...props}
        className="text-4xl font-bold mt-8 mb-4"
      >
        {children}
      </h1>
    );
  },
  h2: ({ children, ...props }) => {
    return (
      <h2
        {...props}
        className="text-3xl font-bold mt-6 mb-3"
      >
        {children}
      </h2>
    );
  },
  h3: ({ children, ...props }) => {
    return (
      <h3
        {...props}
        className="text-2xl font-bold mt-4 mb-2"
      >
        {children}
      </h3>
    );
  },
  h4: ({ children, ...props }) => {
    return (
      <h4
        {...props}
        className="text-xl font-bold mt-3 mb-1"
      >
        {children}
      </h4>
    );
  },
  h5: ({ children, ...props }) => {
    return (
      <h5
        {...props}
        className="text-lg font-bold mt-2 mb-1"
      >
        {children}
      </h5>
    );
  },
  h6: ({ children, ...props }) => {
    return (
      <h6
        {...props}
        className="text-base font-bold mt-1 mb-1"
      >
        {children}
      </h6>
    );
  },
  p: ({ children, ...props }) => {
    return (
      <p {...props} className="text-lg leading-7">
        {children}
      </p>
    );
  },
  ul: ({ children, ...props }) => {
    return (
      <ul {...props} className="list-disc pl-8">
        {children}
      </ul>
    );
  },
  ol: ({ children, ...props }) => {
    return (
      <ol {...props} className="list-decimal pl-8">
        {children}
      </ol>
    );
  },
  li: ({ children, ...props }) => {
    return (
      <li {...props} className="text-lg leading-7">
        {children}
      </li>
    );
  },
  blockquote: ({ children, ...props }) => {
    return (
      <blockquote {...props} className="border-l-4 border-gray-400 pl-4">
        {children}
      </blockquote>
    );
  },
  table: ({ children, ...props }) => {
    return (
      <table {...props} className="table-auto w-full">
        {children}
      </table>
    );
  },
  th: ({ children, ...props }) => {
    return (
      <th {...props} className="border border-gray-400 p-2">
        {children}
      </th>
    );
  },
  td: ({ children, ...props }) => {
    return (
      <td {...props} className="border border-gray-400 p-2">
        {children}
      </td>
    );
  },
  code: ({ children, ...props }) => {
    return (
      <code {...props} className="font-mono bg-gray-200 text-sm p-1 rounded">
        {children}
      </code>
    );
  },
  inlineCode: ({ children, ...props }) => {
    return (
      <code {...props} className="font-mono bg-gray-900 text-sm p-1 rounded-md">
        {children}
      </code>
    );
  },
  img: ({ ...props }) => {
    return <img {...props} className="rounded-md" />;
  },
  strong: ({ children, ...props }) => {
    return <strong {...props}>{children}</strong>;
  },
};