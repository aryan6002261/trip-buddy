import React, { useState } from 'react';
import {
  CheckCircle2,
  Circle,
  RefreshCw,
  Trash2,
  MapPin,
  Clock,
  Footprints,
  Sun,
  CloudRain,
  Sparkles,
  BookOpen,
} from 'lucide-react';
import {
  ItineraryStop,
  PaceEnergyProfile,
  TripWorkspace,
} from '../types';
import { formatMoney } from '../lib/storage';
import { GoogleMapView } from './GoogleMapView';
import { MarkdownRenderer } from './MarkdownRenderer';

interface ItineraryMapPanelProps {
  trip: TripWorkspace;
  isBusy: boolean;
  onUpdatePace: (pace: PaceEnergyProfile) => void;
  onReoptimizeForPace: () => void;
  onToggleStopCompleted: (dayNum: number, stopId: string) => void;
  onDeleteStop: (dayNum: number, stopId: string) => void;
  onTriggerPlanB: (stop: ItineraryStop) => void;
  onRemoveCustomSection: (sectionId: string) => void;
  onAskStarter: (prompt: string) => void;
}

export const ItineraryMapPanel: React.FC<ItineraryMapPanelProps> = ({
  trip,
  isBusy,
  onUpdatePace,
  onReoptimizeForPace,
  onToggleStopCompleted,
  onDeleteStop,
  onTriggerPlanB,
  onRemoveCustomSection,
  onAskStarter,
}) => {
  const [focusedPinId, setFocusedPinId] = useState<string | null>(null);
  const [activeDayFilter, setActiveDayFilter] = useState<number | 'all'>('all');

  const pace = trip.paceProfile;
  const visibleDays =
    activeDayFilter === 'all'
      ? trip.days
      : trip.days.filter((d) => d.day === activeDayFilter);

  const totalStops = trip.days.reduce((sum, d) => sum + d.stops.length, 0);

  return (
    <div className="space-y-5">
      {/* Travel Pace & Energy Optimizer Strip */}
      <div className="rounded-lg bg-[#131C2E] border border-[#24324A] p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
              <Footprints className="w-3.5 h-3.5 text-cyan-400" />
              <span>Travel Pace & Energy Optimizer</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Constraints sync directly with the AI strategist so schedules match your sleep and walking energy.
            </p>
          </div>

          {trip.days.length > 0 && (
            <button
              type="button"
              disabled={isBusy}
              onClick={onReoptimizeForPace}
              className="px-3 py-1.5 rounded-md bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 text-xs font-medium transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Re-optimize Schedule</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {/* Wake Window */}
          <div>
            <div className="text-[11px] text-slate-400 mb-1.5">Sleep & Start Window</div>
            <div className="grid grid-cols-3 border border-[#24324A] rounded-md overflow-hidden">
              {([
                { id: 'early', label: 'Early 7am' },
                { id: 'balanced', label: '9am' },
                { id: 'late', label: 'Late 11am' },
              ] as const).map((opt, idx) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onUpdatePace({ ...pace, wakeWindow: opt.id })}
                  className={`py-1.5 text-[11px] transition cursor-pointer ${
                    idx > 0 ? 'border-l border-[#24324A]' : ''
                  } ${
                    pace.wakeWindow === opt.id
                      ? 'bg-cyan-500/20 text-cyan-200 font-semibold'
                      : 'bg-[#0F172A] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Daily Pace */}
          <div>
            <div className="text-[11px] text-slate-400 mb-1.5">Daily Pace</div>
            <div className="grid grid-cols-3 border border-[#24324A] rounded-md overflow-hidden">
              {(['relaxed', 'moderate', 'packed'] as const).map((opt, idx) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => onUpdatePace({ ...pace, pace: opt })}
                  className={`py-1.5 text-[11px] capitalize transition cursor-pointer ${
                    idx > 0 ? 'border-l border-[#24324A]' : ''
                  } ${
                    pace.pace === opt
                      ? 'bg-cyan-500/20 text-cyan-200 font-semibold'
                      : 'bg-[#0F172A] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Walking Tolerance */}
          <div>
            <div className="text-[11px] text-slate-400 mb-1.5">Walking Tolerance</div>
            <div className="grid grid-cols-3 border border-[#24324A] rounded-md overflow-hidden">
              {(['low', 'medium', 'high'] as const).map((opt, idx) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => onUpdatePace({ ...pace, walkingTolerance: opt })}
                  className={`py-1.5 text-[11px] capitalize transition cursor-pointer ${
                    idx > 0 ? 'border-l border-[#24324A]' : ''
                  } ${
                    pace.walkingTolerance === opt
                      ? 'bg-cyan-500/20 text-cyan-200 font-semibold'
                      : 'bg-[#0F172A] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Route Map (Always visible & live-updated) */}
      <GoogleMapView
        destination={trip.destination}
        country={trip.country}
        centerLat={trip.lat}
        centerLon={trip.lon}
        days={trip.days}
        hiddenGems={trip.hiddenGems}
        liveSuggestions={trip.liveSuggestions}
        userLocation={
          trip.liveLocation.source === 'gps' && trip.liveLocation.lat && trip.liveLocation.lon
            ? { lat: trip.liveLocation.lat, lon: trip.liveLocation.lon, label: trip.liveLocation.label }
            : null
        }
        currency={trip.currency}
        currencySymbol={trip.currencySymbol}
        focusedPinId={focusedPinId}
        onSelectPin={setFocusedPinId}
      />

      {/* Itinerary Section */}
      {trip.days.length === 0 ? (
        <div className="rounded-lg bg-[#131C2E] border border-[#24324A] p-6 text-center">
          <h3 className="text-sm font-semibold text-slate-100">Your dynamic itinerary appears here</h3>
          <p className="text-xs text-slate-400 mt-1.5 max-w-md mx-auto leading-relaxed">
            Chat with TripBuddy on the left first. Once you share your destination, rough budget, and travel rhythm, your route map, verified stops, and custom guides populate here automatically.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              disabled={isBusy}
              onClick={() =>
                onAskStarter(
                  'Let’s plan a 4-day trip to Kyoto from Singapore in autumn. Budget around $1,800 USD, late riser, love specialty coffee and quiet shrines.'
                )
              }
              className="px-3.5 py-2 rounded-md bg-cyan-500 hover:bg-cyan-400 text-[#0B1120] font-semibold text-xs transition cursor-pointer"
            >
              Start a Sample Global Conversation
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Day Filter Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-slate-400 font-mono tabular-nums">
              {trip.days.length} {trip.days.length === 1 ? 'Day' : 'Days'} · {totalStops} stops planned
            </div>
            <div className="flex items-center border border-[#24324A] rounded-md overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => setActiveDayFilter('all')}
                className={`px-2.5 py-1 transition cursor-pointer ${
                  activeDayFilter === 'all'
                    ? 'bg-cyan-500/20 text-cyan-300 font-medium'
                    : 'bg-[#131C2E] text-slate-400 hover:text-slate-200'
                }`}
              >
                All Days
              </button>
              {trip.days.map((d) => (
                <button
                  key={d.day}
                  type="button"
                  onClick={() => setActiveDayFilter(d.day)}
                  className={`px-2.5 py-1 border-l border-[#24324A] transition font-mono tabular-nums cursor-pointer ${
                    activeDayFilter === d.day
                      ? 'bg-cyan-500/20 text-cyan-300 font-medium'
                      : 'bg-[#131C2E] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Day {d.day}
                </button>
              ))}
            </div>
          </div>

          {visibleDays.map((day) => {
            const forecast = trip.weather?.daily?.[day.day - 1];
            return (
              <div
                key={day.day}
                className="rounded-lg bg-[#131C2E] border border-[#24324A] overflow-hidden"
              >
                <div className="px-4 py-3 bg-[#0F172A] border-b border-[#24324A] flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-cyan-400">
                        DAY {String(day.day).padStart(2, '0')}
                      </span>
                      <h4 className="text-sm font-semibold text-slate-100">{day.title}</h4>
                    </div>
                    {day.summary && (
                      <p className="text-xs text-slate-400 mt-0.5">{day.summary}</p>
                    )}
                  </div>

                  {forecast && (
                    <div className="text-xs font-mono tabular-nums flex items-center gap-1.5 text-slate-300">
                      {forecast.severity === 'disruptive' ? (
                        <CloudRain className="w-3.5 h-3.5 text-amber-400" />
                      ) : (
                        <Sun className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      <span>
                        {forecast.tempMin}°–{forecast.tempMax}°C · {forecast.condition}
                        {forecast.precipitationProb >= 30 ? ` · ${forecast.precipitationProb}% rain` : ''}
                      </span>
                    </div>
                  )}
                </div>

                {/* Stops Table/List */}
                <div className="divide-y divide-[#1E2B42]">
                  {day.stops.map((stop) => {
                    const isDone = stop.status === 'completed';
                    const isSwapped = stop.status === 'swapped';
                    return (
                      <div
                        key={stop.id}
                        className={`px-4 py-3 flex items-start justify-between gap-3 transition hover:bg-[#192438]/60 ${
                          isDone ? 'opacity-60' : ''
                        }`}
                      >
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => onToggleStopCompleted(day.day, stop.id)}
                            className="mt-0.5 text-slate-500 hover:text-cyan-400 transition shrink-0 cursor-pointer"
                            title={isDone ? 'Mark as planned' : 'Mark as completed'}
                          >
                            {isDone ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <Circle className="w-4 h-4" />
                            )}
                          </button>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                              <span className="font-mono text-[11px] text-cyan-300 tabular-nums shrink-0 flex items-center gap-1">
                                <Clock className="w-3 h-3 opacity-70" />
                                {stop.timeWindow}
                              </span>
                              <button
                                type="button"
                                onClick={() => stop.lat && setFocusedPinId(stop.id)}
                                className={`text-sm font-semibold text-left transition cursor-pointer ${
                                  isDone ? 'line-through text-slate-400' : 'text-slate-100 hover:text-cyan-300'
                                }`}
                              >
                                {stop.title}
                              </button>
                            </div>

                            {/* Unboxed metadata line */}
                            <div className="text-[11px] text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-1.5">
                              {stop.neighborhood && <span>{stop.neighborhood}</span>}
                              {stop.neighborhood && <span>·</span>}
                              <span className="capitalize">{stop.category.replace('-', ' ')}</span>
                              <span>·</span>
                              <span className="capitalize">{stop.indoorOutdoor}</span>
                              {stop.estimatedCost > 0 && (
                                <>
                                  <span>·</span>
                                  <span className="font-mono tabular-nums text-slate-300">
                                    {formatMoney(stop.estimatedCost, trip.currency, trip.currencySymbol)}
                                  </span>
                                </>
                              )}
                              {isSwapped && (
                                <>
                                  <span>·</span>
                                  <span className="text-amber-300 font-medium">Swapped / Adapted</span>
                                </>
                              )}
                              {stop.isHiddenGem && (
                                <>
                                  <span>·</span>
                                  <span className="text-amber-300 font-medium">Local Gem</span>
                                </>
                              )}
                            </div>

                            <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                              {stop.description}
                            </p>
                          </div>
                        </div>

                        {/* Row Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          {stop.lat && stop.lon && (
                            <button
                              type="button"
                              onClick={() => setFocusedPinId(stop.id)}
                              className="p-1.5 rounded-md text-slate-400 hover:text-cyan-300 hover:bg-[#0F172A] transition cursor-pointer"
                              title="Focus on map"
                            >
                              <MapPin className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => onTriggerPlanB(stop)}
                            className="px-2 py-1 rounded-md text-[11px] font-medium border border-[#24324A] bg-[#0F172A] hover:border-amber-500/50 text-slate-300 hover:text-amber-300 transition flex items-center gap-1 cursor-pointer"
                            title="Generate an instant Plan B replacement for this stop"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>Plan B</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteStop(day.day, stop.id)}
                            className="p-1.5 rounded-md text-slate-500 hover:text-red-400 hover:bg-[#0F172A] transition cursor-pointer"
                            title="Remove stop"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dynamic Custom User-Requested Sections (Only created when user asks!) */}
      {trip.customSections.length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
            <span>Custom Guides & Requested Notes</span>
          </div>

          {trip.customSections.map((sec) => (
            <div
              key={sec.id}
              className="rounded-lg bg-[#131C2E] border border-[#24324A] overflow-hidden"
            >
              <div className="px-4 py-2.5 bg-[#0F172A] border-b border-[#24324A] flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-slate-100">{sec.title}</h4>
                <button
                  type="button"
                  onClick={() => onRemoveCustomSection(sec.id)}
                  className="text-xs text-slate-500 hover:text-red-400 transition cursor-pointer"
                  title="Remove custom section"
                >
                  Remove
                </button>
              </div>
              <div className="px-4 py-3">
                <MarkdownRenderer content={sec.contentMarkdown} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
