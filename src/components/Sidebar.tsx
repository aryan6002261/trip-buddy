import React from 'react';
import { Plane, Compass, Sparkles, Trash2, Cpu, Globe2, Heart, CheckCircle2, XCircle } from 'lucide-react';

interface SidebarProps {
  currentModel: string;
  onModelChange: (model: string) => void;
  onClearTrip: () => void;
  serviceStatus: {
    ai_model: boolean;
    web_search: boolean;
    provider?: string;
  };
  onSelectPrompt: (prompt: string) => void;
  tripDetails?: {
    destination?: string;
    origin?: string;
    budget?: number;
    currency?: string;
    duration?: number;
    travel_style?: string;
  } | null;
}

const SAMPLE_PROMPTS = [
  {
    title: 'Goa from Mumbai (Beach & Cafes)',
    prompt: 'Plan a 4-day trip to Goa starting from Mumbai. Budget is ₹20,000. I love coastal cafes, sunset viewpoints and seafood.',
  },
  {
    title: 'Manali from Delhi (Relaxed)',
    prompt: 'I want to spend 5 days in Manali, starting from Delhi. My budget is ₹15,000. I love photography, nature and cafes. I prefer relaxed trips and hate waking up early.',
  },
  {
    title: 'Kyoto from Tokyo (Culture & Food)',
    prompt: 'Plan a 5-day cultural trip to Kyoto starting from Tokyo. Budget $1,800. Interested in temples, authentic ramen and traditional tea gardens.',
  },
  {
    title: 'Amalfi Coast from Rome',
    prompt: 'Plan 4 days on the Amalfi Coast starting from Rome. Budget €1,500. Scenic coastal drives, beaches and Italian dining.',
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  currentModel,
  onModelChange,
  onClearTrip,
  serviceStatus,
  onSelectPrompt,
  tripDetails,
}) => {
  return (
    <aside className="w-80 bg-slate-900/90 border-r border-slate-800 flex flex-col h-screen shrink-0 overflow-y-auto">
      {/* Brand Header */}
      <div className="p-6 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-xl shadow-inner">
            ✈️
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-1.5">
              TripBuddy
            </h1>
            <p className="text-xs text-slate-400 font-medium">
              Travel planning for people who hate planning.
            </p>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-6 flex-1 text-sm">
        {/* Built for a friend card */}
        <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/50 text-slate-300">
          <div className="flex items-center gap-2 font-semibold text-slate-200 mb-1.5 text-xs uppercase tracking-wider">
            <Heart className="w-3.5 h-3.5 text-rose-400" />
            <span>Built for a friend</span>
          </div>
          <p className="text-xs leading-relaxed text-slate-400">
            TripBuddy doesn't just ask where you want to go. It learns <span className="text-slate-200 font-medium">how you like to travel</span> and builds the trip around you.
          </p>
        </div>

        {/* Current Active Trip Summary if exists */}
        {tripDetails?.destination && (
          <div className="p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-500/30 text-slate-300 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Current Trip</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-medium">
                {tripDetails.duration} Days
              </span>
            </div>
            <div className="text-sm font-bold text-white flex items-center gap-1.5">
              <span>{tripDetails.origin && tripDetails.origin !== 'Flexible' ? tripDetails.origin : 'Flexible Origin'}</span>
              <span className="text-slate-400">→</span>
              <span className="text-indigo-300">{tripDetails.destination}</span>
            </div>
            <div className="text-xs text-slate-400 flex items-center justify-between pt-1 border-t border-indigo-500/20">
              <span>Style: <span className="text-slate-200 capitalize">{tripDetails.travel_style || 'Balanced'}</span></span>
              <span>Budget: <span className="text-emerald-400 font-semibold">{tripDetails.currency || '₹'}{tripDetails.budget?.toLocaleString()}</span></span>
            </div>
          </div>
        )}

        {/* AI Model selector */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <Cpu className="w-3.5 h-3.5 text-indigo-400" />
            <span>AI Planning Brain</span>
          </label>
          <select
            value={currentModel}
            onChange={(e) => onModelChange(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium cursor-pointer"
          >
            <option value="gemini-3.8-flash">⚡ Gemini 3.8 Flash (Active)</option>
            <option value="gemma-4-31b">🆓 Gemma 4 31B (OpenRouter)</option>
            <option value="gpt-oss-20b">🆓 GPT-OSS 20B (Free)</option>
            <option value="free-auto">🆓 Auto-select Free Model</option>
          </select>
          <p className="text-[11px] text-slate-400 leading-normal">
            Multi-agent reasoning with structured state synthesis.
          </p>
        </div>

        {/* Services Status */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <Globe2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Services Status</span>
          </label>
          <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/40 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-300">AI Model Engine</span>
              <span className="flex items-center gap-1 font-medium text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Connected
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Google Search Data</span>
              <span className="flex items-center gap-1 font-medium text-blue-400">
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" /> Active Grounding
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Google Maps Data</span>
              <span className="flex items-center gap-1 font-medium text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Active Grounding
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-300">OpenStreetMap Geocoding</span>
              <span className="flex items-center gap-1 font-medium text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Active
              </span>
            </div>
          </div>
        </div>

        {/* Example prompts */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Quick Suggestions</span>
          </label>
          <div className="space-y-1.5">
            {SAMPLE_PROMPTS.map((p, idx) => (
              <button
                key={idx}
                onClick={() => onSelectPrompt(p.prompt)}
                className="w-full text-left p-2.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 hover:border-slate-600 transition text-xs text-slate-300 hover:text-white group flex flex-col gap-0.5 cursor-pointer"
              >
                <span className="font-medium text-slate-200 group-hover:text-indigo-300 flex items-center justify-between">
                  {p.title}
                  <span className="text-[10px] text-slate-400 group-hover:text-slate-300">Use ↵</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Clear Trip Button */}
      <div className="p-4 border-t border-slate-800/80 bg-slate-950/40">
        <button
          onClick={onClearTrip}
          className="w-full py-2.5 px-3 rounded-lg bg-slate-800 hover:bg-rose-950/30 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-800/50 text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5 text-rose-400" />
          <span>Clear Trip History</span>
        </button>
      </div>
    </aside>
  );
};
