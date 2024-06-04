import { MDXComponents } from "mdx/types";

export const components: MDXComponents = {
  a: ({ children, ...props }) => {
    return (
      <a
        {...props}
        className="underline hover:text-blue-600 duration-100"
        target="_blank"
      >
        {children}
      </a>
    );
  },
};