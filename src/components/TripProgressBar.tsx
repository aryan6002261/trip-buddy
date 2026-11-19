import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  Compass,
  Loader2,
  Newspaper,
  ChevronDown,
  ChevronUp,
  Navigation,
  Wallet,
  ExternalLink,
} from 'lucide-react';
import { ItineraryStop, TripWorkspace } from '../types';
import { formatMoney } from '../lib/storage';

interface TripProgressBarProps {
  trip: TripWorkspace;
  isBusy: boolean;
  onMarkNextDone: (dayNum: number, stopId: string) => void;
  onRequestGuidance: () => Promise<void>;
  onOpenLiveNews: () => void;
  onAskQuickAction: (prompt: string) => void;
}

export const TripProgressBar: React.FC<TripProgressBarProps> = ({
  trip,
  isBusy,
  onMarkNextDone,
  onRequestGuidance,
  onOpenLiveNews,
  onAskQuickAction,
}) => {
  const [expanded, setExpanded] = useState(true);

  const stats = useMemo(() => {
    const allStops: Array<ItineraryStop & { dayTitle: string }> = [];
    for (const d of trip.days) {
      for (const s of d.stops) {
        allStops.push({ ...s, dayTitle: d.title });
      }
    }
    const total = allStops.length;
    const completed = allStops.filter((s) => s.status === 'completed').length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    const nextStop = allStops.find((s) => s.status !== 'completed') || null;
    const activeDay = nextStop ? nextStop.day : trip.days.length;
    return { total, completed, percent, nextStop, activeDay };
  }, [trip.days]);

  const spent = useMemo(
    () => trip.expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0),
    [trip.expenses]
  );

  const guidance = trip.activeGuidance;
  const alertNewsCount = (trip.areaNews?.items || []).filter(
    (n) => n.severity === 'alert' || n.severity === 'watch'
  ).length;

  return (
    <div className="rounded-lg bg-[#131C2E] border border-[#24324A] overflow-hidden mb-5">
      {/* Compact Header & Progress Track */}
      <div className="px-4 py-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Compass className="w-4 h-4 text-cyan-400 shrink-0" />
            <span className="text-xs font-semibold text-slate-100">
              Trip Progress & Live Guide
            </span>
            <span className="text-xs font-mono tabular-nums text-slate-400">
              · {stats.completed}/{stats.total} stops ({stats.percent}%)
              {trip.days.length > 0 ? ` · Day ${stats.activeDay} of ${trip.days.length}` : ''}
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {stats.nextStop && (
              <button
                type="button"
                onClick={() => onMarkNextDone(stats.nextStop!.day, stats.nextStop!.id)}
                className="px-2.5 py-1 rounded-md border border-[#24324A] bg-[#0F172A] hover:border-emerald-500/50 text-[11px] font-medium text-slate-200 hover:text-emerald-300 transition flex items-center gap-1 cursor-pointer"
                title="Mark current upcoming stop as completed"
              >
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span>Complete Next</span>
              </button>
            )}

            <button
              type="button"
              disabled={isBusy || (!trip.destination && !trip.liveLocation.label)}
              onClick={onRequestGuidance}
              className="px-3 py-1 rounded-md bg-cyan-500 hover:bg-cyan-400 disabled:bg-[#192438] disabled:text-slate-500 text-[#0B1120] font-semibold text-[11px] transition flex items-center gap-1.5 cursor-pointer"
            >
              {isBusy ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Navigation className="w-3 h-3" />
              )}
              <span>Guide Me Now</span>
            </button>

            <button
              type="button"
              onClick={onOpenLiveNews}
              className="px-2.5 py-1 rounded-md border border-[#24324A] bg-[#0F172A] hover:border-cyan-500/50 text-[11px] text-slate-300 hover:text-cyan-300 transition flex items-center gap-1 cursor-pointer"
            >
              <Newspaper className="w-3 h-3 text-cyan-400" />
              <span>
                Area News
                {alertNewsCount > 0 ? ` (${alertNewsCount})` : ''}
              </span>
            </button>

            {guidance && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="p-1 text-slate-400 hover:text-slate-100 transition cursor-pointer"
                title={expanded ? 'Collapse guidance details' : 'Expand guidance details'}
              >
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>

        {/* Crisp Segmented Progress Bar */}
        <div className="w-full h-1.5 rounded-xs bg-[#0B1120] border border-[#1E2B42] overflow-hidden">
          <div
            className="h-full bg-cyan-400 transition-all duration-300"
            style={{ width: `${stats.percent}%` }}
          />
        </div>

        {/* Next Stop / Budget / Live Context Line */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
          <div className="truncate">
            {stats.nextStop ? (
              <span>
                <span className="text-cyan-300 font-medium">Up next:</span>{' '}
                <span className="text-slate-200 font-medium">{stats.nextStop.title}</span>
                <span className="font-mono tabular-nums text-slate-500">
                  {' '}· {stats.nextStop.timeWindow}
                  {stats.nextStop.neighborhood ? ` · ${stats.nextStop.neighborhood}` : ''}
                </span>
              </span>
            ) : trip.destination ? (
              <span>
                {stats.total > 0
                  ? 'All planned stops completed — click Guide Me Now for spontaneous next moves.'
                  : `Destination set to ${trip.destination} — click Guide Me Now for live area news & next-step guidance.`}
              </span>
            ) : (
              <span>Tell TripBuddy your destination in chat to unlock live progress tracking and local news guidance.</span>
            )}
          </div>

          {trip.targetBudget > 0 && (
            <div className="font-mono tabular-nums text-slate-400 shrink-0 flex items-center gap-1">
              <Wallet className="w-3 h-3 text-slate-500" />
              <span>
                {formatMoney(spent, trip.currency, trip.currencySymbol)} /{' '}
                {formatMoney(trip.targetBudget, trip.currency, trip.currencySymbol)} spent
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Live AI Step-by-Step Guidance Drawer */}
      {guidance && expanded && (
        <div className="px-4 py-3 bg-[#0F172A] border-t border-[#24324A] space-y-2.5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-cyan-300">{guidance.headline}</span>
            <span className="text-[10px] font-mono text-slate-500">
              Updated {new Date(guidance.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          <p className="text-slate-200 leading-relaxed">{guidance.nextAction}</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1 text-[11px]">
            <div className="p-2.5 rounded bg-[#131C2E] border border-[#24324A]">
              <div className="text-slate-400 font-medium mb-0.5">Transit & Timing</div>
              <div className="text-slate-200 leading-snug">{guidance.transitTip}</div>
            </div>
            <div className="p-2.5 rounded bg-[#131C2E] border border-[#24324A]">
              <div className="text-slate-400 font-medium mb-0.5">Budget Pacing</div>
              <div className="text-slate-200 leading-snug">{guidance.budgetCheckNote}</div>
            </div>
            <div className="p-2.5 rounded bg-[#131C2E] border border-[#24324A]">
              <div className="text-amber-300 font-medium mb-0.5">Live Local News Pulse</div>
              <div className="text-slate-200 leading-snug">{guidance.newsHeadsUp}</div>
            </div>
          </div>

          {guidance.quickActions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {guidance.quickActions.map((qa, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={isBusy}
                  onClick={() => onAskQuickAction(qa)}
                  className="px-2.5 py-1 rounded bg-[#131C2E] hover:bg-[#192438] border border-[#24324A] hover:border-cyan-500/50 text-[11px] text-slate-300 hover:text-cyan-200 transition cursor-pointer"
                >
                  {qa}
                </button>
              ))}
            </div>
          )}

          {guidance.sources.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500 pt-0.5">
              <span>Live sources:</span>
              {guidance.sources.slice(0, 4).map((s, idx) => (
                <a
                  key={idx}
                  href={s.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-400 hover:text-cyan-300 inline-flex items-center gap-1 max-w-[180px] truncate"
                >
                  <span className="truncate">{s.title}</span>
                  <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
