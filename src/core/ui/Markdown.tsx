"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/** Shared apOS-styled markdown renderer (reports, insights, agent output). */
const components: Components = {
  h1: (props) => (
    <h1
      className="mt-4 mb-2 font-display text-lg font-semibold text-ink first:mt-0"
      {...props}
    />
  ),
  h2: (props) => (
    <h2
      className="mt-4 mb-2 font-display text-base font-semibold text-ink first:mt-0"
      {...props}
    />
  ),
  h3: (props) => (
    <h3
      className="mt-3 mb-1.5 font-display text-sm font-medium text-ink first:mt-0"
      {...props}
    />
  ),
  p: (props) => (
    <p className="mb-2 text-sm leading-relaxed text-ink-dim" {...props} />
  ),
  a: (props) => (
    <a
      className="text-plasma underline decoration-plasma/40 underline-offset-2 transition hover:decoration-plasma"
      target="_blank"
      rel="noreferrer"
      {...props}
    />
  ),
  strong: (props) => <strong className="font-semibold text-ink" {...props} />,
  em: (props) => <em className="text-ink-dim/90" {...props} />,
  ul: (props) => (
    <ul
      className="mb-2.5 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink-dim marker:text-ink-faint"
      {...props}
    />
  ),
  ol: (props) => (
    <ol
      className="mb-2.5 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-ink-dim marker:text-ink-faint"
      {...props}
    />
  ),
  li: (props) => <li className="pl-0.5" {...props} />,
  code: (props) => (
    <code
      className="rounded bg-white/5 px-1 py-0.5 font-mono text-[12px] text-ion"
      {...props}
    />
  ),
  pre: (props) => (
    <pre
      className="mb-2.5 overflow-x-auto rounded-lg border border-white/6 bg-black/30 p-3 font-mono text-[12px] leading-relaxed [&_code]:bg-transparent [&_code]:p-0"
      {...props}
    />
  ),
  blockquote: (props) => (
    <blockquote
      className="mb-2.5 border-l-2 border-violet/40 pl-3 text-sm italic text-ink-dim"
      {...props}
    />
  ),
  hr: () => <hr className="my-3 border-white/6" />,
  // GFM tables — without these the model's `| a | b |` output renders as raw
  // pipes (same fix as the Ask answer view).
  table: (props) => (
    <div className="mb-3 overflow-x-auto rounded-lg border border-white/8">
      <table className="w-full border-collapse text-[13px]" {...props} />
    </div>
  ),
  thead: (props) => <thead className="bg-white/[0.04]" {...props} />,
  tr: (props) => <tr {...props} />,
  th: (props) => (
    <th
      className="border-b border-white/10 px-3 py-2 text-left align-top font-mono text-[10px] uppercase tracking-widest text-ink-dim"
      {...props}
    />
  ),
  td: (props) => (
    <td
      className="border-b border-white/6 px-3 py-2 align-top leading-relaxed text-ink-dim [&:not(:last-child)]:border-r [&:not(:last-child)]:border-white/6"
      {...props}
    />
  ),
};

export function Markdown({ children }: { children: string }) {
  return (
    <div dir="auto">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
