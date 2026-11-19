import React, { useState } from 'react';
import {
  Compass,
  Sparkles,
  MapPin,
  Plus,
  Loader2,
  ArrowRight,
  Coffee,
} from 'lucide-react';
import {
  HiddenGemItem,
  SurprisePitch,
  TripWorkspace,
} from '../types';
import { CURRENCY_MAP, formatMoney, getCurrencySymbol } from '../lib/storage';

interface DiscoverPanelProps {
  trip: TripWorkspace;
  isBusy: boolean;
  onRunSurpriseMe: (params: {
    origin: string;
    budget: number;
    currency: string;
    durationDays: number;
    personality: string;
    vibe: string;
  }) => Promise<void>;
  onLaunchSurpriseTrip: (pitch: SurprisePitch) => void;
  onRunLocalGems: (destination: string, focus: string) => Promise<void>;
  onToggleGemPin: (gemId: string) => void;
  onAddGemToDay: (gem: HiddenGemItem, dayNum: number) => void;
}

export const DiscoverPanel: React.FC<DiscoverPanelProps> = ({
  trip,
  isBusy,
  onRunSurpriseMe,
  onLaunchSurpriseTrip,
  onRunLocalGems,
  onToggleGemPin,
  onAddGemToDay,
}) => {
  // Surprise Me state
  const [origin, setOrigin] = useState(trip.origin || '');
  const [days, setDays] = useState(trip.durationDays || 5);
  const [budget, setBudget] = useState(trip.targetBudget || 1600);
  const [currency, setCurrency] = useState(trip.currency || 'USD');
  const [personality, setPersonality] = useState('Slow Curious Explorer');
  const [vibe, setVibe] = useState('Underrated food, walkable neighborhoods & coastal or mountain views');

  // Local Friend / Hidden Gems state
  const [gemsDestination, setGemsDestination] = useState(
    [trip.destination, trip.country].filter(Boolean).join(', ')
  );
  const [gemsFocus, setGemsFocus] = useState('Hidden cafés, local street food & non-touristy viewpoints');
  const [targetDay, setTargetDay] = useState<number>(trip.days[0]?.day || 1);

  return (
    <div className="space-y-5">
      {/* AI Local Friend & Hidden Gems Discovery */}
      <div className="rounded-lg bg-[#131C2E] border border-[#24324A] p-4 space-y-3.5">
        <div>
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <Coffee className="w-4 h-4 text-amber-400" />
            <span>AI Local Friend & Hidden Gems Discovery</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Acts like a trusted local resident — uncovering underrated cafés, neighborhood eats, and lesser-known spots you can pin directly onto your map.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
          <div className="sm:col-span-5">
            <label className="block text-[11px] text-slate-400 mb-1">City or Region</label>
            <input
              type="text"
              value={gemsDestination}
              onChange={(e) => setGemsDestination(e.target.value)}
              placeholder={trip.destination || 'e.g. Lisbon, Kyoto, Mexico City'}
              className="w-full px-3 py-2 rounded-md bg-[#0F172A] border border-[#24324A] focus:border-cyan-500/60 focus:outline-none text-xs text-slate-100 placeholder:text-slate-500"
            />
          </div>
          <div className="sm:col-span-5">
            <label className="block text-[11px] text-slate-400 mb-1">What kind of local spots?</label>
            <input
              type="text"
              value={gemsFocus}
              onChange={(e) => setGemsFocus(e.target.value)}
              placeholder="e.g. indie coffee, vinyl bars, quiet trails"
              className="w-full px-3 py-2 rounded-md bg-[#0F172A] border border-[#24324A] focus:border-cyan-500/60 focus:outline-none text-xs text-slate-100 placeholder:text-slate-500"
            />
          </div>
          <div className="sm:col-span-2 flex items-end">
            <button
              type="button"
              disabled={isBusy || !(gemsDestination.trim() || trip.destination)}
              onClick={() => onRunLocalGems(gemsDestination.trim() || trip.destination, gemsFocus)}
              className="w-full px-3 py-2 rounded-md bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-[#0B1120] font-semibold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Compass className="w-3.5 h-3.5" />}
              <span>Explore</span>
            </button>
          </div>
        </div>

        {trip.hiddenGems.length > 0 && (
          <div className="space-y-2.5 pt-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-200">
                Local Resident Picks ({trip.hiddenGems.length})
              </span>
              {trip.days.length > 0 && (
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <span>Insert into:</span>
                  <select
                    value={targetDay}
                    onChange={(e) => setTargetDay(Number(e.target.value))}
                    className="px-2 py-0.5 rounded bg-[#0F172A] border border-[#24324A] text-slate-200 font-mono"
                  >
                    {trip.days.map((d) => (
                      <option key={d.day} value={d.day}>Day {d.day}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="divide-y divide-[#1E2B42] border border-[#24324A] rounded-md bg-[#0F172A]">
              {trip.hiddenGems.map((gem) => (
                <div key={gem.id} className="p-3.5 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-100">{gem.title}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5 font-mono tabular-nums">
                      {[
                        gem.neighborhood,
                        gem.bestTime,
                        gem.estimatedCost > 0
                          ? formatMoney(gem.estimatedCost, trip.currency, trip.currencySymbol)
                          : 'Free / nominal',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                    <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                      {gem.whyLocalsLoveIt}
                    </p>
                    {gem.insiderTip && (
                      <p className="text-[11px] text-amber-300/90 mt-1">
                        Local tip: {gem.insiderTip}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onToggleGemPin(gem.id)}
                      className={`px-2.5 py-1 rounded-md border text-[11px] font-medium transition flex items-center gap-1 cursor-pointer ${
                        gem.pinnedOnMap
                          ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
                          : 'border-[#24324A] bg-[#131C2E] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <MapPin className="w-3 h-3" />
                      <span>{gem.pinnedOnMap ? 'Pinned' : 'Pin Map'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onAddGemToDay(gem, targetDay)}
                      className="px-2.5 py-1 rounded-md border border-[#24324A] hover:border-cyan-500/50 bg-[#131C2E] text-[11px] text-slate-200 hover:text-cyan-300 transition flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add to Plan</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Surprise Me Mode */}
      <div className="rounded-lg bg-[#131C2E] border border-[#24324A] p-4 space-y-3.5">
        <div>
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span>Surprise Me Mode</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Discover unexpected global destinations matched to your departure city, available days, budget, and travel personality.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
          <div className="sm:col-span-4">
            <label className="block text-[11px] text-slate-400 mb-1">Departing From</label>
            <input
              type="text"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              placeholder="e.g. Toronto, Berlin, Mumbai"
              className="w-full px-3 py-2 rounded-md bg-[#0F172A] border border-[#24324A] focus:border-cyan-500/60 focus:outline-none text-xs text-slate-100 placeholder:text-slate-500"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-[11px] text-slate-400 mb-1">Days</label>
            <input
              type="number"
              min={2}
              max={21}
              value={days}
              onChange={(e) => setDays(Math.max(2, Number(e.target.value) || 5))}
              className="w-full px-3 py-2 rounded-md bg-[#0F172A] border border-[#24324A] text-xs font-mono tabular-nums text-slate-100"
            />
          </div>

          <div className="sm:col-span-3">
            <label className="block text-[11px] text-slate-400 mb-1">Budget</label>
            <input
              type="number"
              min={100}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value) || 1000)}
              className="w-full px-3 py-2 rounded-md bg-[#0F172A] border border-[#24324A] text-xs font-mono tabular-nums text-slate-100"
            />
          </div>

          <div className="sm:col-span-3">
            <label className="block text-[11px] text-slate-400 mb-1">Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full px-2.5 py-2 rounded-md bg-[#0F172A] border border-[#24324A] text-xs font-mono text-slate-200"
            >
              {Object.keys(CURRENCY_MAP).map((code) => (
                <option key={code} value={code}>
                  {code} ({getCurrencySymbol(code).trim()})
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-5">
            <label className="block text-[11px] text-slate-400 mb-1">Travel Personality</label>
            <select
              value={personality}
              onChange={(e) => setPersonality(e.target.value)}
              className="w-full px-2.5 py-2 rounded-md bg-[#0F172A] border border-[#24324A] text-xs text-slate-200"
            >
              <option value="Slow Curious Explorer">Slow Curious Explorer</option>
              <option value="Street Food & Night Market Hunter">Street Food & Night Market Hunter</option>
              <option value="Design, Architecture & Coffee Lover">Design, Architecture & Coffee Lover</option>
              <option value="Nature & Scenic Rail Adventurer">Nature & Scenic Rail Adventurer</option>
              <option value="History Buff & Museum Hopper">History Buff & Museum Hopper</option>
              <option value="Spontaneous Budget Backpacker">Spontaneous Budget Backpacker</option>
            </select>
          </div>

          <div className="sm:col-span-7">
            <label className="block text-[11px] text-slate-400 mb-1">Vibe or Interests</label>
            <input
              type="text"
              value={vibe}
              onChange={(e) => setVibe(e.target.value)}
              placeholder="e.g. coastal cliffs, jazz bars, great public transit"
              className="w-full px-3 py-2 rounded-md bg-[#0F172A] border border-[#24324A] focus:border-cyan-500/60 focus:outline-none text-xs text-slate-100 placeholder:text-slate-500"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            disabled={isBusy}
            onClick={() =>
              onRunSurpriseMe({
                origin: origin.trim(),
                budget,
                currency,
                durationDays: days,
                personality,
                vibe,
              })
            }
            className="px-4 py-2 rounded-md bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-[#0B1120] font-semibold text-xs transition flex items-center gap-1.5 cursor-pointer"
          >
            {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            <span>Surprise Me Globally</span>
          </button>
        </div>

        {trip.surprisePitches.length > 0 && (
          <div className="grid grid-cols-1 gap-3 pt-2">
            {trip.surprisePitches.map((pitch) => (
              <div
                key={pitch.id}
                className="p-3.5 rounded-md bg-[#0F172A] border border-[#24324A] flex flex-col sm:flex-row sm:items-start justify-between gap-3"
              >
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <h4 className="text-sm font-bold text-slate-50">
                      {pitch.destination}, {pitch.country}
                    </h4>
                    <span className="font-mono text-xs tabular-nums text-cyan-300">
                      ~{formatMoney(pitch.estimatedTotal, pitch.currency, pitch.currencySymbol)} · {pitch.durationDays} days
                    </span>
                  </div>
                  <div className="text-xs font-medium text-slate-300">{pitch.tagline}</div>
                  <p className="text-xs text-slate-400 leading-relaxed">{pitch.whyItFits}</p>
                  {pitch.highlights.length > 0 && (
                    <div className="text-[11px] text-slate-300 pt-0.5">
                      {pitch.highlights.join(' · ')}
                    </div>
                  )}
                  {pitch.seasonNote && (
                    <div className="text-[11px] text-slate-500">{pitch.seasonNote}</div>
                  )}
                </div>

                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => onLaunchSurpriseTrip(pitch)}
                  className="px-3 py-2 rounded-md bg-[#131C2E] hover:bg-cyan-500 hover:text-[#0B1120] border border-cyan-500/40 text-cyan-300 text-xs font-semibold transition flex items-center gap-1.5 shrink-0 self-start cursor-pointer"
                >
                  <span>Start Planning</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
