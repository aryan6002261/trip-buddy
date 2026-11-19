import React, { useState } from 'react';
import {
  Navigation,
  CloudRain,
  Sun,
  Wind,
  RefreshCw,
  Loader2,
  MapPin,
  Clock,
  Plus,
  Crosshair,
  AlertTriangle,
  ArrowRightLeft,
  Newspaper,
  ExternalLink,
  ArrowRight,
} from 'lucide-react';
import {
  AreaNewsItem,
  ItineraryStop,
  LiveSuggestion,
  PlanBAlternative,
  TripWorkspace,
} from '../types';
import { formatMoney } from '../lib/storage';

interface LiveCompanionPanelProps {
  trip: TripWorkspace;
  isBusy: boolean;
  planBTarget: ItineraryStop | null;
  planBResults: PlanBAlternative[];
  planBNote: string | null;
  onClearPlanBTarget: () => void;
  onFetchWeather: (lat?: number, lon?: number, label?: string) => Promise<void>;
  onAdaptWeather: () => Promise<void>;
  onFetchAreaNews: (locationOverride?: string) => Promise<void>;
  onReactToNewsItem: (item: AreaNewsItem) => void;
  onGetLiveSuggestions: (params: {
    locationLabel: string;
    lat?: number;
    lon?: number;
    remainingHours: number;
    mood: string;
  }) => Promise<void>;
  onAddLiveSuggestionToDay: (suggestion: LiveSuggestion, dayNum: number) => void;
  onRunPlanB: (reason: string, stop?: ItineraryStop | null) => Promise<void>;
  onApplyPlanBSwap: (alt: PlanBAlternative, targetStop: ItineraryStop | null, dayNum: number) => void;
  onUpdateLiveLocation: (loc: TripWorkspace['liveLocation']) => void;
}

export const LiveCompanionPanel: React.FC<LiveCompanionPanelProps> = ({
  trip,
  isBusy,
  planBTarget,
  planBResults,
  planBNote,
  onClearPlanBTarget,
  onFetchWeather,
  onAdaptWeather,
  onFetchAreaNews,
  onReactToNewsItem,
  onGetLiveSuggestions,
  onAddLiveSuggestionToDay,
  onRunPlanB,
  onApplyPlanBSwap,
  onUpdateLiveLocation,
}) => {
  const [locationInput, setLocationInput] = useState(
    trip.liveLocation.label || trip.destination || ''
  );
  const [remainingHours, setRemainingHours] = useState<number>(
    trip.liveLocation.remainingHours || 3
  );
  const [mood, setMood] = useState('');
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [planBReason, setPlanBReason] = useState('Venue is closed, fully booked, or weather shifted');
  const [targetDayForInsert, setTargetDayForInsert] = useState<number>(
    trip.days[0]?.day || 1
  );

  const handleUseGps = () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by this browser. Enter your neighborhood manually.');
      return;
    }
    setGeoLoading(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(5));
        const lon = Number(pos.coords.longitude.toFixed(5));
        const label = `GPS (${lat}, ${lon})`;
        setLocationInput(label);
        onUpdateLiveLocation({
          label,
          lat,
          lon,
          remainingHours,
          source: 'gps',
        });
        setGeoLoading(false);
        await onFetchWeather(lat, lon, label);
      },
      () => {
        setGeoLoading(false);
        setGeoError('Location permission denied — type your current neighborhood or city instead.');
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  };

  const disruptiveDays = (trip.weather?.daily || []).filter(
    (d) => d.severity === 'disruptive' || d.severity === 'caution'
  );

  const newsTarget = locationInput.trim() || [trip.destination, trip.country].filter(Boolean).join(', ');

  return (
    <div className="space-y-5">
      {/* Live Area News & Trusted Sources Feed (Tavily News) */}
      <div className="rounded-lg bg-[#131C2E] border border-[#24324A] p-4 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Newspaper className="w-4 h-4 text-cyan-400" />
              <span>Live Area News & Trusted Advisories</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Real-time transit disruptions, local events, closures, and breaking area updates pulled via Tavily from trusted publications.
            </p>
          </div>
          <button
            type="button"
            disabled={isBusy || !newsTarget}
            onClick={() => onFetchAreaNews(newsTarget)}
            className="px-3.5 py-1.5 rounded-md bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-[#0B1120] font-semibold text-xs transition flex items-center gap-1.5 cursor-pointer"
          >
            {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            <span>Refresh Live News</span>
          </button>
        </div>

        {!trip.areaNews ? (
          <div className="p-4 rounded-md bg-[#0F172A] border border-[#24324A] text-xs text-slate-400 flex flex-wrap items-center justify-between gap-3">
            <span>
              {newsTarget
                ? `Load live breaking news, transit notices, and local events happening right now in ${newsTarget}.`
                : 'Enter your current city below or choose a destination in chat to track local news.'}
            </span>
            {newsTarget && (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => onFetchAreaNews(newsTarget)}
                className="text-cyan-400 hover:text-cyan-300 font-medium cursor-pointer"
              >
                Fetch Trusted Updates
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="p-3 rounded-md bg-[#0F172A] border border-[#24324A] text-xs text-slate-200 leading-relaxed flex flex-wrap items-center justify-between gap-2">
              <span>{trip.areaNews.summary}</span>
              <span className="text-[10px] font-mono text-slate-500">
                {trip.areaNews.locationName} · Checked{' '}
                {new Date(trip.areaNews.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            {trip.areaNews.items.length > 0 && (
              <div className="divide-y divide-[#1E2B42] border border-[#24324A] rounded-md bg-[#0F172A]">
                {trip.areaNews.items.map((item) => (
                  <div key={item.id} className="p-3.5 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px]">
                        <span
                          className={`font-semibold uppercase tracking-wide ${
                            item.severity === 'alert'
                              ? 'text-red-400'
                              : item.severity === 'watch'
                              ? 'text-amber-300'
                              : 'text-cyan-300'
                          }`}
                        >
                          {item.category}
                        </span>
                        <span className="text-slate-600">·</span>
                        <span className="font-mono text-slate-400">{item.sourceName}</span>
                        {item.publishedDate && (
                          <>
                            <span className="text-slate-600">·</span>
                            <span className="font-mono text-slate-500">{item.publishedDate.slice(0, 10)}</span>
                          </>
                        )}
                      </div>

                      {item.url ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-semibold text-slate-100 hover:text-cyan-300 transition inline-flex items-center gap-1.5"
                        >
                          <span>{item.title}</span>
                          <ExternalLink className="w-3 h-3 shrink-0 opacity-75" />
                        </a>
                      ) : (
                        <div className="text-sm font-semibold text-slate-100">{item.title}</div>
                      )}

                      <p className="text-xs text-slate-300 leading-relaxed">{item.impactSummary}</p>
                      {item.actionableAdvice && (
                        <p className="text-[11px] text-cyan-300/90">
                          Traveler move: {item.actionableAdvice}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => onReactToNewsItem(item)}
                      className="px-2.5 py-1.5 rounded-md border border-[#24324A] hover:border-cyan-500/50 bg-[#131C2E] text-[11px] text-slate-200 hover:text-cyan-300 transition flex items-center gap-1 shrink-0 cursor-pointer"
                      title="Ask AI strategist to adjust your itinerary around this news item"
                    >
                      <span>Adjust Plan</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Live Location & Right-Now Companion */}
      <div className="rounded-lg bg-[#131C2E] border border-[#24324A] p-4 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Navigation className="w-4 h-4 text-cyan-400" />
              <span>Live Trip Companion</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Real-time nearby suggestions calibrated to your current area, remaining time, budget, and live weather.
            </p>
          </div>
          <button
            type="button"
            onClick={handleUseGps}
            disabled={geoLoading || isBusy}
            className="px-3 py-1.5 rounded-md bg-[#0F172A] hover:bg-[#192438] border border-[#24324A] hover:border-cyan-500/50 text-xs text-slate-200 flex items-center gap-1.5 transition cursor-pointer"
          >
            {geoLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" /> : <Crosshair className="w-3.5 h-3.5 text-cyan-400" />}
            <span>Use My GPS</span>
          </button>
        </div>

        {geoError && <p className="text-xs text-amber-300">{geoError}</p>}

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-5">
            <label className="block text-[11px] text-slate-400 mb-1">Current neighborhood or city</label>
            <input
              type="text"
              value={locationInput}
              onChange={(e) => {
                setLocationInput(e.target.value);
                onUpdateLiveLocation({
                  ...trip.liveLocation,
                  label: e.target.value,
                  source: 'manual',
                });
              }}
              placeholder={trip.destination || 'e.g. Shibuya, Tokyo or Alfama, Lisbon'}
              className="w-full px-3 py-2 rounded-md bg-[#0F172A] border border-[#24324A] focus:border-cyan-500/60 focus:outline-none text-xs text-slate-100 placeholder:text-slate-500"
            />
          </div>

          <div className="md:col-span-3">
            <label className="block text-[11px] text-slate-400 mb-1">Time free right now</label>
            <select
              value={remainingHours}
              onChange={(e) => {
                const hrs = Number(e.target.value);
                setRemainingHours(hrs);
                onUpdateLiveLocation({ ...trip.liveLocation, remainingHours: hrs });
              }}
              className="w-full px-2.5 py-2 rounded-md bg-[#0F172A] border border-[#24324A] focus:border-cyan-500/60 focus:outline-none text-xs text-slate-100 font-mono tabular-nums"
            >
              <option value={1}>1 hour</option>
              <option value={2}>2 hours</option>
              <option value={3}>3 hours</option>
              <option value={5}>5 hours</option>
              <option value={8}>Full day (8h)</option>
            </select>
          </div>

          <div className="md:col-span-4">
            <label className="block text-[11px] text-slate-400 mb-1">Current mood or need</label>
            <input
              type="text"
              value={mood}
              onChange={(e) => setMood(e.target.value)}
              placeholder="e.g. quiet coffee, quick lunch, indoor walk"
              className="w-full px-3 py-2 rounded-md bg-[#0F172A] border border-[#24324A] focus:border-cyan-500/60 focus:outline-none text-xs text-slate-100 placeholder:text-slate-500"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <span className="text-[11px] text-slate-400">
            {trip.localFriendMode ? 'Local Friend Mode ON — prioritizing underrated neighborhood spots' : 'Tip: Toggle Local Friend Mode in the top toolbar for non-touristy picks'}
          </span>
          <button
            type="button"
            disabled={isBusy}
            onClick={() =>
              onGetLiveSuggestions({
                locationLabel: locationInput.trim() || trip.destination,
                lat: trip.liveLocation.source === 'gps' ? trip.liveLocation.lat : trip.lat,
                lon: trip.liveLocation.source === 'gps' ? trip.liveLocation.lon : trip.lon,
                remainingHours,
                mood,
              })
            }
            className="px-4 py-2 rounded-md bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-[#0B1120] font-semibold text-xs transition flex items-center gap-1.5 cursor-pointer"
          >
            {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Navigation className="w-3.5 h-3.5" />}
            <span>Find Right-Now Suggestions</span>
          </button>
        </div>

        {trip.liveSuggestions.length > 0 && (
          <div className="pt-3 border-t border-[#24324A] space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-200">Immediate Nearby Moves</span>
              {trip.days.length > 0 && (
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <span>Add to:</span>
                  <select
                    value={targetDayForInsert}
                    onChange={(e) => setTargetDayForInsert(Number(e.target.value))}
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
              {trip.liveSuggestions.map((item) => (
                <div key={item.id} className="p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-100">{item.title}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5 font-mono tabular-nums">
                      {[
                        item.neighborhood,
                        item.indoorOutdoor,
                        `~${item.estimatedMinutes} min`,
                        item.estimatedCost > 0
                          ? formatMoney(item.estimatedCost, trip.currency, trip.currencySymbol)
                          : 'Free / low cost',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">{item.whyNow}</p>
                    {item.localTip && (
                      <p className="text-[11px] text-cyan-300/90 mt-1">Insider move: {item.localTip}</p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => onAddLiveSuggestionToDay(item, targetDayForInsert)}
                    className="px-2.5 py-1.5 rounded-md border border-[#24324A] hover:border-cyan-500/50 bg-[#131C2E] text-xs text-slate-200 hover:text-cyan-300 transition flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Smart Weather-Adaptive Itinerary */}
      <div className="rounded-lg bg-[#131C2E] border border-[#24324A] p-4 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <CloudRain className="w-4 h-4 text-cyan-400" />
              <span>Smart Weather-Adaptive Itinerary</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Live global Open-Meteo conditions with one-click indoor/outdoor schedule rearrangement.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isBusy || (!trip.destination && !locationInput.trim())}
              onClick={() =>
                onFetchWeather(
                  trip.lat,
                  trip.lon,
                  [trip.destination, trip.country].filter(Boolean).join(', ') || locationInput.trim()
                )
              }
              className="px-3 py-1.5 rounded-md bg-[#0F172A] hover:bg-[#192438] border border-[#24324A] text-xs text-slate-200 transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`} />
              <span>Refresh Forecast</span>
            </button>

            {trip.days.length > 0 && (
              <button
                type="button"
                disabled={isBusy}
                onClick={onAdaptWeather}
                className="px-3 py-1.5 rounded-md bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-xs font-medium transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <CloudRain className="w-3.5 h-3.5" />
                <span>Adapt Plan for Weather</span>
              </button>
            )}
          </div>
        </div>

        {!trip.weather ? (
          <div className="p-4 rounded-md bg-[#0F172A] border border-[#24324A] text-xs text-slate-400 flex items-center justify-between gap-3">
            <span>No live weather loaded yet for {trip.destination || 'your destination'}.</span>
            <button
              type="button"
              disabled={isBusy || (!trip.destination && !locationInput.trim())}
              onClick={() =>
                onFetchWeather(
                  trip.lat,
                  trip.lon,
                  [trip.destination, trip.country].filter(Boolean).join(', ') || locationInput.trim()
                )
              }
              className="text-cyan-400 hover:text-cyan-300 font-medium cursor-pointer"
            >
              Load Live Forecast
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="p-3 rounded-md bg-[#0F172A] border border-[#24324A] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="text-2xl font-bold font-mono tabular-nums text-slate-50">
                  {trip.weather.currentTemp}°C
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-100">
                    {trip.weather.locationName} · {trip.weather.currentCondition}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono tabular-nums flex items-center gap-2 mt-0.5">
                    <span className="inline-flex items-center gap-1">
                      <Wind className="w-3 h-3" /> {trip.weather.currentWindKmh} km/h
                    </span>
                    <span>·</span>
                    <span>
                      {disruptiveDays.length > 0
                        ? `${disruptiveDays.length} weather-watch ${disruptiveDays.length === 1 ? 'day' : 'days'} ahead`
                        : 'Clear conditions ahead'}
                    </span>
                  </div>
                </div>
              </div>

              {trip.weather.isRaining && (
                <div className="text-xs text-amber-300 flex items-center gap-1.5 font-medium">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Rain active now — favor indoor venues</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {trip.weather.daily.slice(0, 7).map((d, idx) => {
                const isAlert = d.severity === 'disruptive';
                const isCaution = d.severity === 'caution';
                return (
                  <div
                    key={d.date}
                    className={`p-2.5 rounded-md border text-xs ${
                      isAlert
                        ? 'bg-amber-950/25 border-amber-500/40'
                        : isCaution
                        ? 'bg-[#0F172A] border-amber-500/25'
                        : 'bg-[#0F172A] border-[#24324A]'
                    }`}
                  >
                    <div className="text-[10px] font-mono text-slate-400">
                      {idx === 0 ? 'Today' : d.date.slice(5)}
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-slate-100 font-mono font-semibold tabular-nums">
                      {isAlert || isCaution ? (
                        <CloudRain className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      ) : (
                        <Sun className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      )}
                      <span>{d.tempMax}°/{d.tempMin}°</span>
                    </div>
                    <div className="text-[11px] text-slate-300 truncate mt-1" title={d.condition}>
                      {d.condition}
                    </div>
                    <div className="text-[10px] font-mono tabular-nums text-slate-500 mt-0.5">
                      {d.precipitationProb}% rain
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Instant Plan B Generator */}
      <div className="rounded-lg bg-[#131C2E] border border-[#24324A] p-4 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-cyan-400" />
              <span>Plan B Generator</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Instantly replace any closed attraction, full restaurant, or cancelled stop with verified nearby alternatives.
            </p>
          </div>
          {planBTarget && (
            <button
              type="button"
              onClick={onClearPlanBTarget}
              className="text-xs text-slate-400 hover:text-slate-200 underline cursor-pointer"
            >
              Clear target stop
            </button>
          )}
        </div>

        {planBTarget && (
          <div className="p-3 rounded-md bg-[#0F172A] border border-amber-500/40 text-xs">
            <div className="text-amber-300 font-medium">
              Replacing Day {planBTarget.day} · {planBTarget.timeWindow}
            </div>
            <div className="text-sm font-semibold text-slate-100 mt-0.5">{planBTarget.title}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {[planBTarget.neighborhood, planBTarget.category, planBTarget.indoorOutdoor]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={planBReason}
            onChange={(e) => setPlanBReason(e.target.value)}
            placeholder="What happened? (e.g. Museum sold out, sudden rain, restaurant closed)"
            className="flex-1 px-3 py-2 rounded-md bg-[#0F172A] border border-[#24324A] focus:border-cyan-500/60 focus:outline-none text-xs text-slate-100 placeholder:text-slate-500"
          />
          <button
            type="button"
            disabled={isBusy || (!trip.destination && !locationInput.trim())}
            onClick={() => onRunPlanB(planBReason, planBTarget)}
            className="px-4 py-2 rounded-md bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-[#0B1120] font-semibold text-xs transition flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
          >
            {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            <span>Generate Plan B</span>
          </button>
        </div>

        {planBNote && <p className="text-xs text-slate-300">{planBNote}</p>}

        {planBResults.length > 0 && (
          <div className="divide-y divide-[#1E2B42] border border-[#24324A] rounded-md bg-[#0F172A]">
            {planBResults.map((alt) => (
              <div key={alt.id} className="p-3 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-100">{alt.title}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5 font-mono tabular-nums flex flex-wrap items-center gap-x-1.5">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {alt.neighborhood}
                    </span>
                    <span>·</span>
                    <span className="capitalize">{alt.indoorOutdoor}</span>
                    <span>·</span>
                    <span>{formatMoney(alt.estimatedCost, trip.currency, trip.currencySymbol)}</span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1">{alt.reason}</p>
                  <div className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{alt.openStatus}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onApplyPlanBSwap(alt, planBTarget, planBTarget?.day || targetDayForInsert)}
                  className="px-3 py-1.5 rounded-md bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-200 text-xs font-medium transition shrink-0 cursor-pointer"
                >
                  {planBTarget ? 'Swap In' : 'Add to Day'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
