import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ExternalLink } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
  return (
    <div className={`markdown-body text-slate-200 ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ ...props }) => (
            <h1 className="text-xl font-bold text-white mt-6 mb-3 pb-2 border-b border-slate-800 flex items-center gap-2" {...props} />
          ),
          h2: ({ ...props }) => (
            <h2 className="text-lg font-bold text-indigo-300 mt-6 mb-3 flex items-center gap-2" {...props} />
          ),
          h3: ({ ...props }) => (
            <h3 className="text-base font-semibold text-slate-100 mt-4 mb-2" {...props} />
          ),
          h4: ({ ...props }) => (
            <h4 className="text-sm font-semibold text-slate-200 mt-3 mb-1.5" {...props} />
          ),
          p: ({ ...props }) => (
            <p className="text-slate-300 leading-relaxed my-2.5 text-sm" {...props} />
          ),
          strong: ({ ...props }) => (
            <strong className="font-semibold text-white tracking-wide" {...props} />
          ),
          em: ({ ...props }) => (
            <em className="italic text-slate-300" {...props} />
          ),
          ul: ({ ...props }) => (
            <ul className="list-disc list-outside pl-5 my-3 space-y-1.5 text-slate-300 text-sm" {...props} />
          ),
          ol: ({ ...props }) => (
            <ol className="list-decimal list-outside pl-5 my-3 space-y-1.5 text-slate-300 text-sm" {...props} />
          ),
          li: ({ ...props }) => (
            <li className="leading-relaxed" {...props} />
          ),
          blockquote: ({ ...props }) => (
            <blockquote className="border-l-4 border-indigo-500 pl-4 py-1.5 my-3 bg-indigo-950/20 text-slate-300 italic rounded-r-lg" {...props} />
          ),
          hr: ({ ...props }) => (
            <hr className="my-6 border-slate-800" {...props} />
          ),
          a: ({ href, children, ...props }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition inline-flex items-center gap-1 font-medium"
              {...props}
            >
              <span>{children}</span>
              <ExternalLink className="w-3 h-3 inline-block shrink-0 opacity-80" />
            </a>
          ),
          table: ({ ...props }) => (
            <div className="overflow-x-auto my-4 rounded-xl border border-slate-700/80 bg-slate-900/60 shadow-lg">
              <table className="min-w-full divide-y divide-slate-700/80 text-left text-xs" {...props} />
            </div>
          ),
          thead: ({ ...props }) => (
            <thead className="bg-slate-800/90 text-slate-200 font-semibold uppercase tracking-wider" {...props} />
          ),
          tbody: ({ ...props }) => (
            <tbody className="divide-y divide-slate-800/80 text-slate-300" {...props} />
          ),
          tr: ({ ...props }) => (
            <tr className="hover:bg-slate-800/50 transition-colors" {...props} />
          ),
          th: ({ ...props }) => (
            <th className="px-4 py-3 font-semibold text-slate-200" {...props} />
          ),
          td: ({ ...props }) => (
            <td className="px-4 py-3 align-top leading-relaxed text-slate-300" {...props} />
          ),
          code: ({ className, children, ...props }: any) => {
            const isBlock = Boolean(className) || (typeof children === 'string' && children.includes('\n'));
            if (isBlock) {
              return (
                <pre className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 font-mono text-xs overflow-x-auto my-3">
                  <code {...props}>{children}</code>
                </pre>
              );
            }
            return (
              <code className="px-1.5 py-0.5 rounded bg-slate-800/90 text-indigo-300 font-mono text-xs border border-slate-700/60" {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
