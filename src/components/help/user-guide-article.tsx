import { isValidElement, type ReactNode } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";

import { resolveUserGuideHref } from "@/domain/help/user-guide";

interface UserGuideArticleProps {
  baseHref: string;
  content: string;
}

function getNodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(getNodeText).join("");
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    return getNodeText(node.props.children);
  }

  return "";
}

function getHeadingId(children: ReactNode): string {
  return getNodeText(children)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function UserGuideArticle({
  baseHref,
  content,
}: UserGuideArticleProps) {
  return (
    <ReactMarkdown
      components={{
        h1: ({ children }) => (
          <h1
            id={getHeadingId(children)}
            className="scroll-mt-24 text-3xl font-semibold tracking-[-0.035em] text-foreground"
          >
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2
            id={getHeadingId(children)}
            className="mt-10 scroll-mt-24 border-t pt-8 text-2xl font-semibold tracking-[-0.025em] text-foreground first:border-0"
          >
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3
            id={getHeadingId(children)}
            className="mt-7 scroll-mt-24 text-lg font-semibold text-foreground"
          >
            {children}
          </h3>
        ),
        p: ({ children }) => (
          <p className="mt-4 text-[0.975rem] leading-7 text-muted-foreground">
            {children}
          </p>
        ),
        ul: ({ children }) => (
          <ul className="mt-4 list-disc space-y-2 pl-6 leading-7 text-muted-foreground marker:text-primary">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="mt-4 list-decimal space-y-2 pl-6 leading-7 text-muted-foreground marker:font-semibold marker:text-primary">
            {children}
          </ol>
        ),
        li: ({ children }) => <li className="pl-1">{children}</li>,
        strong: ({ children }) => (
          <strong className="font-semibold text-foreground">{children}</strong>
        ),
        blockquote: ({ children }) => (
          <blockquote className="mt-5 border-l-4 border-primary/40 bg-muted/50 px-5 py-1">
            {children}
          </blockquote>
        ),
        pre: ({ children }) => (
          <pre className="mt-5 overflow-x-auto rounded-xl bg-foreground p-4 text-sm leading-6 text-background [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-inherit">
            {children}
          </pre>
        ),
        code: ({ children }) => (
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em] text-foreground">
            {children}
          </code>
        ),
        a: ({ href, children }) => {
          const resolvedHref = resolveUserGuideHref(href, baseHref);

          if (!resolvedHref) {
            return <span>{children}</span>;
          }

          if (
            resolvedHref.startsWith("http://") ||
            resolvedHref.startsWith("https://") ||
            resolvedHref.startsWith("mailto:")
          ) {
            return (
              <a
                href={resolvedHref}
                className="font-medium text-primary underline underline-offset-4"
              >
                {children}
              </a>
            );
          }

          return (
            <Link
              href={resolvedHref}
              className="font-medium text-primary underline underline-offset-4"
            >
              {children}
            </Link>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
