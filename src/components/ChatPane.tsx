import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Loader2,
  ExternalLink,
  Compass,
  Navigation,
  Sparkles,
} from 'lucide-react';
import { ChatMessage, WorkspaceMode } from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';

interface ChatPaneProps {
  messages: ChatMessage[];
  mode: WorkspaceMode;
  localFriendMode: boolean;
  isLoading: boolean;
  error: string | null;
  onSendMessage: (text: string) => void;
  onDismissError: () => void;
}

export const ChatPane: React.FC<ChatPaneProps> = ({
  messages,
  mode,
  localFriendMode,
  isLoading,
  error,
  onSendMessage,
  onDismissError,
}) => {
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    setInput('');
    onSendMessage(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const lastAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant');

  return (
    <section className="flex flex-col h-full bg-[#0F172A] border-r border-[#24324A] min-h-0">
      {/* Sub-header */}
      <div className="px-4 py-3 border-b border-[#24324A] flex items-center justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            {mode === 'live' ? (
              <Navigation className="w-4 h-4 text-cyan-400 shrink-0" />
            ) : (
              <Compass className="w-4 h-4 text-cyan-400 shrink-0" />
            )}
            <span className="truncate">
              {mode === 'live' ? 'Live Trip Co-Pilot' : 'Travel Strategist'}
            </span>
          </h2>
          <p className="text-xs text-slate-400 truncate mt-0.5">
            {localFriendMode
              ? 'Local Friend voice active · prioritizing non-touristy neighborhood tips'
              : mode === 'live'
              ? 'Ask for right-now swaps, transit tips, or nearby open venues'
              : 'Conversational intake · asks before locking plans · updates cockpit live'}
          </p>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 min-h-0">
        {messages.map((msg, idx) => {
          const isUser = msg.role === 'user';
          const isLatestAssistant = !isUser && msg.id === lastAssistantMsg?.id;

          return (
            <div key={msg.id || idx} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
              <div className="flex items-center gap-2 mb-1 text-[11px] text-slate-500">
                <span className="font-medium text-slate-400">
                  {isUser ? 'You' : msg.localFriendMode ? 'TripBuddy · Local Friend' : 'TripBuddy'}
                </span>
                {msg.modelUsed && !isUser && (
                  <span className="font-mono text-[10px] text-slate-500">
                    · {msg.modelUsed.replace(/^openrouter\//, '')}
                  </span>
                )}
              </div>

              <div
                className={`max-w-[94%] rounded-lg px-3.5 py-2.5 text-sm ${
                  isUser
                    ? 'bg-[#192438] border border-cyan-500/30 text-slate-100'
                    : 'bg-[#131C2E] border border-[#24324A] text-slate-200 w-full'
                }`}
              >
                {isUser ? (
                  <p className="whitespace-pre-wrap leading-relaxed text-[13.5px]">{msg.content}</p>
                ) : (
                  <MarkdownRenderer content={msg.content} />
                )}

                {/* Applied Workspace Updates (unboxed typographic ledger) */}
                {!isUser && msg.appliedUpdates && msg.appliedUpdates.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-[#24324A] space-y-1">
                    <div className="text-[11px] font-medium text-cyan-400 flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3" />
                      <span>Updated in cockpit</span>
                    </div>
                    <ul className="text-xs text-slate-400 space-y-0.5 pl-4 list-disc">
                      {msg.appliedUpdates.map((u, i) => (
                        <li key={i}>{u}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Verifiable Sources */}
                {!isUser && msg.sources && msg.sources.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-[#1E2B42]">
                    <div className="text-[11px] text-slate-500 mb-1">Live sources checked</div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {msg.sources.slice(0, 5).map((src, sIdx) => (
                        <a
                          key={sIdx}
                          href={src.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-slate-400 hover:text-cyan-300 inline-flex items-center gap-1 transition max-w-[200px] truncate"
                        >
                          <span className="truncate">{src.title}</span>
                          <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Interactive Quick-Reply Buttons on latest assistant message */}
              {isLatestAssistant && msg.quickReplies && msg.quickReplies.length > 0 && !isLoading && (
                <div className="mt-2.5 flex flex-wrap gap-1.5 w-full">
                  {msg.quickReplies.map((qr, qIdx) => (
                    <button
                      key={qIdx}
                      type="button"
                      onClick={() => onSendMessage(qr)}
                      className="text-left text-xs px-3 py-1.5 rounded-md bg-[#131C2E] hover:bg-[#192438] border border-[#24324A] hover:border-cyan-500/50 text-slate-300 hover:text-cyan-200 transition cursor-pointer"
                    >
                      {qr}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {isLoading && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-[#131C2E] border border-[#24324A] text-xs text-slate-400">
            <Loader2 className="w-4 h-4 text-cyan-400 animate-spin shrink-0 mt-0.5" />
            <div>
              <div className="text-slate-200 font-medium">Researching live data & updating your plan</div>
              <div className="text-slate-500 mt-0.5">Checking recent prices, local routes, and verified coordinates...</div>
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-lg bg-red-950/40 border border-red-500/40 text-xs text-red-200 flex items-start justify-between gap-3">
            <span>{error}</span>
            <button
              type="button"
              onClick={onDismissError}
              className="text-red-300 hover:text-white underline shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Message Input Composer */}
      <form
        onSubmit={handleSubmit}
        className="p-3 border-t border-[#24324A] bg-[#0B1120] shrink-0"
      >
        <div className="flex items-end gap-2 bg-[#131C2E] border border-[#24324A] focus-within:border-cyan-500/60 rounded-lg p-2 transition">
          <textarea
            ref={textareaRef}
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            placeholder={
              mode === 'live'
                ? 'Ask for nearby open spots, a sudden Plan B, or transit advice...'
                : 'Tell me where, budget, vibe — or ask to change any stop or add a custom section...'
            }
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 resize-none focus:outline-none px-1 py-0.5 leading-snug"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="h-9 px-3.5 rounded-md bg-cyan-500 hover:bg-cyan-400 disabled:bg-[#192438] disabled:text-slate-500 text-[#0B1120] font-semibold text-xs flex items-center gap-1.5 transition shrink-0 cursor-pointer"
          >
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            <span>Send</span>
          </button>
        </div>
      </form>
    </section>
  );
};
