import { MDXComponents } from "mdx/types";

export const components: MDXComponents = {
  a: ({ children, href, ...props }) => {
    const isInternal = href?.startsWith("/") || href?.startsWith("#");
    return (
      <a
        {...props}
        className="underline text-[#333333] font-bold"
        rel={!isInternal ? "noopener noreferrer" : undefined}
        target={!isInternal ? "_blank" : undefined}
        href={href}
      >
        {children}
      </a>
    );
  },
  h1: ({ children, ...props }) => {
    return (
      <h1 {...props} className="text-3xl font-medium mt-8 mb-4 text-[#333333]">
        {children}
      </h1>
    );
  },
  h2: ({ children, ...props }) => {
    return (
      <h2 {...props} className="text-2xl font-medium mt-6 mb-3 text-[#333333]">
        {children}
      </h2>
    );
  },
  h3: ({ children, ...props }) => {
    return (
      <h3 {...props} className="text-2xl font-medium mt-4 mb-2 text-[#333333]">
        {children}
      </h3>
    );
  },
  h4: ({ children, ...props }) => {
    return (
      <h4 {...props} className="text-xl font-medium mt-3 mb-1 text-[#333333]">
        {children}
      </h4>
    );
  },
  h5: ({ children, ...props }) => {
    return (
      <h5 {...props} className="text-lg font-medium mt-2 mb-1 text-[#333333]">
        {children}
      </h5>
    );
  },
  h6: ({ children, ...props }) => {
    return (
      <h6 {...props} className="text-base font-medium mt-1 mb-1 text-[#333333]">
        {children}
      </h6>
    );
  },
  p: ({ children, ...props }) => {
    return (
      <p {...props} className="text-base font-normal leading-7 text-[#404040]">
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
      <li {...props} className="text-md leading-7">
        {children}
      </li>
    );
  },

  table: ({ children, ...props }) => {
    return (
      <table
        {...props}
        className="w-full text-sm text-left rtl:text-right text-[#404040] border rounded-md border-spacing-0 border-separate my-2 overflow-hidden"
      >
        {children}
      </table>
    );
  },
  thead: ({ children, ...props }) => {
    return (
      <thead {...props} className="text-md text-neutral-900 font-medium">
        {children}
      </thead>
    );
  },
  th: ({ children, ...props }) => {
    return (
      <th {...props} className="bg-neutral-300 px-6 py-3">
        {children}
      </th>
    );
  },
  td: ({ children, ...props }) => {
    return (
      <td {...props} className="p-2 px-6">
        {children}
      </td>
    );
  },
  tr: ({ children, ...props }) => {
    return (
      <tr {...props} className="odd:bg-white even:bg-neutral-100 border-b">
        {children}
      </tr>
    );
  },

  img: ({ ...props }) => {
    return (
      <img
        {...props}
        className="rounded-xl"
        alt={props.alt || "Image"}
      />
    );
  },
  strong: ({ children, ...props }) => {
    return <strong {...props}>{children}</strong>;
  },
  blockquote: ({ children, ...props }) => {
    return (
      <blockquote {...props} className="border-l-4 border-gray-400 pl-4">
        {children}
      </blockquote>
    );
  },
  pre: ({ children, ...props }) => {
    return (
      <pre
        {...props}
        className="bg-neutral-100 p-3 rounded border-gray-400 pl-4 relative my-2 text-sm font-mono break-all"
      >
        <div className="text-xs text-gray-500 absolute right-4">Code</div>
        {children}
      </pre>
    );
  },
};

/*

  */
