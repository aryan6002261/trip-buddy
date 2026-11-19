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
            <h1 className="text-base font-bold text-slate-50 mt-4 mb-2 pb-1.5 border-b border-[#24324A]" {...props} />
          ),
          h2: ({ ...props }) => (
            <h2 className="text-sm font-bold text-cyan-300 mt-4 mb-1.5" {...props} />
          ),
          h3: ({ ...props }) => (
            <h3 className="text-sm font-semibold text-slate-100 mt-3 mb-1" {...props} />
          ),
          p: ({ ...props }) => (
            <p className="text-slate-300 leading-relaxed my-2 text-[13.5px]" {...props} />
          ),
          strong: ({ ...props }) => (
            <strong className="font-semibold text-slate-50" {...props} />
          ),
          em: ({ ...props }) => (
            <em className="italic text-slate-300" {...props} />
          ),
          ul: ({ ...props }) => (
            <ul className="list-disc list-outside pl-4 my-2 space-y-1 text-slate-300 text-[13.5px]" {...props} />
          ),
          ol: ({ ...props }) => (
            <ol className="list-decimal list-outside pl-4 my-2 space-y-1 text-slate-300 text-[13.5px]" {...props} />
          ),
          li: ({ ...props }) => (
            <li className="leading-relaxed" {...props} />
          ),
          blockquote: ({ ...props }) => (
            <blockquote className="pl-3 py-1 my-2 border-l border-cyan-500/60 text-slate-300 italic" {...props} />
          ),
          hr: ({ ...props }) => (
            <hr className="my-4 border-[#24324A]" {...props} />
          ),
          a: ({ href, children, ...props }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 transition inline-flex items-center gap-1"
              {...props}
            >
              <span>{children}</span>
              <ExternalLink className="w-3 h-3 inline-block shrink-0 opacity-80" />
            </a>
          ),
          table: ({ ...props }) => (
            <div className="overflow-x-auto my-3 border border-[#24324A] rounded-lg bg-[#0F172A]">
              <table className="min-w-full divide-y divide-[#24324A] text-left text-xs" {...props} />
            </div>
          ),
          thead: ({ ...props }) => (
            <thead className="bg-[#131C2E] text-slate-300 font-semibold" {...props} />
          ),
          tbody: ({ ...props }) => (
            <tbody className="divide-y divide-[#1E2B42] text-slate-300" {...props} />
          ),
          th: ({ ...props }) => (
            <th className="px-3 py-2 font-semibold text-slate-200" {...props} />
          ),
          td: ({ ...props }) => (
            <td className="px-3 py-2 align-top text-slate-300" {...props} />
          ),
          code: ({ className: codeClass, children, ...props }: any) => {
            const isBlock = Boolean(codeClass) || (typeof children === 'string' && children.includes('\n'));
            if (isBlock) {
              return (
                <pre className="p-3 rounded-lg bg-[#0B1120] border border-[#24324A] text-slate-300 font-mono text-xs overflow-x-auto my-2">
                  <code {...props}>{children}</code>
                </pre>
              );
            }
            return (
              <code className="px-1 py-0.5 rounded bg-[#192438] text-cyan-300 font-mono text-xs" {...props}>
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
