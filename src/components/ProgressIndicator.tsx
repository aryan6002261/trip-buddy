import React from 'react';
import { Brain, Plane, Hotel, Map, Sparkles, CheckCircle2, Loader2, Search, MapPin } from 'lucide-react';
import { AgentNode } from '../types';

interface ProgressIndicatorProps {
  currentNode?: AgentNode | null;
  completedNodes: AgentNode[];
  currentStatusText?: string;
}

const STEPS: { node: AgentNode; label: string; tag?: string; icon: React.ReactNode }[] = [
  { node: 'orchestrator', label: 'Trip Profiler', icon: <Brain className="w-3.5 h-3.5" /> },
  { node: 'flight_agent', label: 'Live Transport', tag: 'Google Search', icon: <Plane className="w-3.5 h-3.5" /> },
  { node: 'hotel_agent', label: 'Stays & Spots', tag: 'Google Maps', icon: <Hotel className="w-3.5 h-3.5" /> },
  { node: 'itinerary_agent', label: 'Itinerary Pacing', icon: <Map className="w-3.5 h-3.5" /> },
  { node: 'synthesizer', label: 'Synthesizing', icon: <Sparkles className="w-3.5 h-3.5" /> },
];

export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  currentNode,
  completedNodes,
  currentStatusText,
}) => {
  return (
    <div className="p-4 rounded-xl bg-slate-900/90 border border-indigo-500/30 shadow-lg space-y-3 my-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
          <span className="text-xs font-bold text-white uppercase tracking-wider">
            Multi-Agent Grounding Workflow
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-950/70 border border-blue-500/30 text-[10px] text-blue-300 font-mono">
            <Search className="w-2.5 h-2.5" /> Google Search
          </span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-950/70 border border-emerald-500/30 text-[10px] text-emerald-300 font-mono">
            <MapPin className="w-2.5 h-2.5" /> Google Maps
          </span>
          <span className="text-xs text-indigo-300 font-mono ml-1">
            {completedNodes.length}/5
          </span>
        </div>
      </div>

      {currentStatusText && (
        <div className="p-2.5 rounded-lg bg-indigo-950/40 border border-indigo-500/20 text-xs text-indigo-200 flex items-center gap-2 font-medium">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
          </span>
          <span>{currentStatusText}</span>
        </div>
      )}

      {/* Steps visual track */}
      <div className="grid grid-cols-5 gap-1.5 pt-1">
        {STEPS.map((s) => {
          const isDone = completedNodes.includes(s.node);
          const isCurrent = currentNode === s.node;

          return (
            <div
              key={s.node}
              className={`p-2 rounded-lg border text-[11px] flex flex-col items-center gap-1 text-center transition-all ${
                isDone
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                  : isCurrent
                  ? 'bg-indigo-900/40 border-indigo-500 text-indigo-200 ring-1 ring-indigo-500/50 animate-pulse'
                  : 'bg-slate-800/40 border-slate-700/40 text-slate-500'
              }`}
            >
              <div className="flex items-center justify-center">
                {isDone ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : isCurrent ? (
                  <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                ) : (
                  s.icon
                )}
              </div>
              <span className="truncate w-full font-medium">{s.label}</span>
              {s.tag && (
                <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800/80 border border-slate-700/60 text-slate-400 truncate max-w-full">
                  {s.tag}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
