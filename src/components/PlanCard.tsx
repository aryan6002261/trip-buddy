import React, { useState } from 'react';
import { Copy, Check, Plane, Hotel, Calendar, MapPin, Map as MapIcon, Compass, Search, ExternalLink, Globe, FileDown, DollarSign } from 'lucide-react';
import { ParsedTripDetails, GroundingSource } from '../types';
import { GoogleMapView } from './GoogleMapView';
import { ExpenseBreakdown } from './ExpenseBreakdown';
import { MarkdownRenderer } from './MarkdownRenderer';

interface PlanCardProps {
  content: string;
  parsed?: ParsedTripDetails;
  flight_info?: string;
  hotel_info?: string;
  itinerary_info?: string;
  grounding_sources?: GroundingSource[];
  search_queries?: string[];
}

export const PlanCard: React.FC<PlanCardProps> = ({
  content,
  parsed,
  flight_info,
  hotel_info,
  itinerary_info,
  grounding_sources = parsed?.grounding_sources || [],
  search_queries = parsed?.search_queries || [],
}) => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'map' | 'transport' | 'stays' | 'itinerary' | 'grounding' | 'expenses'>('all');

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl overflow-hidden text-slate-200">
      {/* Top Banner / Trip Quick Stats */}
      {parsed && parsed.destination && (
        <div className="bg-gradient-to-r from-indigo-950/80 via-slate-900 to-slate-900 p-5 border-b border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-400">
                <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                <span>Trip Overview</span>
              </div>
              <h2 className="text-xl font-bold text-white mt-1">
                {parsed.destination}
              </h2>
              {parsed.location_data?.display_name && (
                <p className="text-xs text-slate-400 truncate max-w-lg mt-0.5">
                  {parsed.location_data.display_name}
                </p>
              )}
              {/* Grounding tags */}
              <div className="flex items-center gap-2 mt-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-950/80 border border-blue-500/40 text-[10px] text-blue-300 font-medium">
                  <Search className="w-2.5 h-2.5 text-blue-400" />
                  Google Search Grounded
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-[10px] text-emerald-300 font-medium">
                  <MapPin className="w-2.5 h-2.5 text-emerald-400" />
                  Google Maps Grounded
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('map')}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition cursor-pointer ${
                  activeTab === 'map'
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                    : 'bg-indigo-950/50 hover:bg-indigo-900/60 border-indigo-500/40 text-indigo-300'
                }`}
              >
                <Compass className="w-3.5 h-3.5 text-indigo-400" />
                <span>Interactive Map</span>
              </button>
              <button
                onClick={handleCopy}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1.5 transition cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy Plan'}</span>
              </button>
              <button
                onClick={() => window.print()}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white flex items-center gap-1.5 transition cursor-pointer shadow-sm"
                title="Export trip plan and expense breakdown as PDF"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>Export as PDF</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4 pt-3 border-t border-slate-800/80 text-xs">
            <div className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/50">
              <span className="text-slate-400 block text-[11px]">Duration</span>
              <span className="font-semibold text-white">{parsed.duration} Days</span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/50">
              <span className="text-slate-400 block text-[11px]">Budget</span>
              <span className="font-semibold text-emerald-400">
                {parsed.currency}{parsed.budget?.toLocaleString()}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/50">
              <span className="text-slate-400 block text-[11px]">Travel Style</span>
              <span className="font-semibold text-indigo-300 capitalize">{parsed.travel_style || 'Balanced'}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/50">
              <span className="text-slate-400 block text-[11px]">Departing From</span>
              <span className="font-semibold text-white">{parsed.origin || 'Flexible'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Tabs navigation */}
      <div className="flex items-center gap-1 px-4 py-2.5 bg-slate-950/60 border-b border-slate-800 text-xs overflow-x-auto">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
            activeTab === 'all'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <span>Complete Plan</span>
        </button>
        <button
          onClick={() => setActiveTab('map')}
          className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
            activeTab === 'map'
              ? 'bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-400/50'
              : 'text-indigo-300 hover:text-indigo-100 hover:bg-indigo-950/40'
          }`}
        >
          <MapIcon className="w-3 h-3 text-indigo-400" />
          <span>Interactive Map</span>
        </button>
        {flight_info && (
          <button
            onClick={() => setActiveTab('transport')}
            className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'transport'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Plane className="w-3 h-3" />
            <span>Transport (Search Grounded)</span>
          </button>
        )}
        {hotel_info && (
          <button
            onClick={() => setActiveTab('stays')}
            className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'stays'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Hotel className="w-3 h-3" />
            <span>Stays (Maps Grounded)</span>
          </button>
        )}
        {itinerary_info && (
          <button
            onClick={() => setActiveTab('itinerary')}
            className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'itinerary'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Calendar className="w-3 h-3" />
            <span>Itinerary</span>
          </button>
        )}
        <button
          onClick={() => setActiveTab('expenses')}
          className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
            activeTab === 'expenses'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <DollarSign className="w-3 h-3 text-emerald-400" />
          <span>Expenses</span>
        </button>
        {(grounding_sources.length > 0 || search_queries.length > 0) && (
          <button
            onClick={() => setActiveTab('grounding')}
            className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'grounding'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Globe className="w-3 h-3 text-cyan-400" />
            <span>Grounding Sources ({grounding_sources.length})</span>
          </button>
        )}
      </div>

      {/* Content Body */}
      <div className="p-6 text-sm leading-relaxed prose prose-invert prose-indigo max-w-none">
        {activeTab === 'map' ? (
          <div className="space-y-3 not-prose">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Compass className="w-4 h-4 text-indigo-400" />
                Itinerary Visualizer & Route Map
              </h3>
              <span className="text-xs text-slate-400">
                Pinch / Scroll to zoom • Drag to pan
              </span>
            </div>
            <GoogleMapView
              locations={parsed?.locations}
              destination={parsed?.destination}
              origin={parsed?.origin}
              duration={parsed?.duration}
              itineraryText={itinerary_info}
              locationData={parsed?.location_data}
              originLocationData={parsed?.origin_location_data}
            />
          </div>
        ) : activeTab === 'expenses' ? (
          <div className="space-y-4 not-prose">
            <ExpenseBreakdown parsed={parsed} />
          </div>
        ) : activeTab === 'transport' && flight_info ? (
          <div className="space-y-4 not-prose">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2 m-0">
                <Plane className="w-4 h-4 text-indigo-400" />
                Transport & Route Options
              </h3>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-950/70 border border-blue-500/30 text-[11px] text-blue-300">
                <Search className="w-3 h-3 text-blue-400" /> Google Search Data
              </span>
            </div>
            <MarkdownRenderer content={flight_info} />
          </div>
        ) : activeTab === 'stays' && hotel_info ? (
          <div className="space-y-4 not-prose">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2 m-0">
                <Hotel className="w-4 h-4 text-indigo-400" />
                Accommodation Recommendations
              </h3>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/70 border border-emerald-500/30 text-[11px] text-emerald-300">
                <MapPin className="w-3 h-3 text-emerald-400" /> Google Maps Data
              </span>
            </div>
            <MarkdownRenderer content={hotel_info} />
          </div>
        ) : activeTab === 'itinerary' && itinerary_info ? (
          <div className="space-y-4 not-prose">
            <h3 className="text-base font-bold text-white flex items-center gap-2 pb-2 border-b border-slate-800 m-0">
              <Calendar className="w-4 h-4 text-indigo-400" />
              Day-by-Day Personalized Itinerary
            </h3>
            <MarkdownRenderer content={itinerary_info} />
          </div>
        ) : activeTab === 'grounding' ? (
          <div className="space-y-4 not-prose">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-cyan-400" />
              Live Grounding & Data Sources
            </h3>
            <p className="text-xs text-slate-400">
              This trip was generated with real-time data verified via Google Search Grounding and Google Maps Grounding.
            </p>

            {search_queries.length > 0 && (
              <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-2">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Search className="w-3 h-3 text-blue-400" /> Google Search Queries Run
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {search_queries.map((q, idx) => (
                    <span key={idx} className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-xs text-slate-300 font-mono">
                      {q}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {grounding_sources.length > 0 ? (
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-300 block">Verified Places & Citations</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {grounding_sources.map((source, idx) => (
                    <a
                      key={idx}
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 hover:border-slate-600 transition flex items-center justify-between text-xs group"
                    >
                      <div className="flex items-center gap-2 truncate pr-2">
                        {source.type === 'maps' ? (
                          <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <Globe className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        )}
                        <span className="text-slate-200 group-hover:text-white truncate font-medium">
                          {source.title}
                        </span>
                      </div>
                      <ExternalLink className="w-3 h-3 text-slate-500 group-hover:text-slate-300 shrink-0" />
                    </a>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic">
                Grounding queries were queried through Gemini 3.5 Flash Google Search & Maps APIs.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Embedded interactive map preview in the complete plan */}
            <div className="not-prose">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                  <MapIcon className="w-3.5 h-3.5" />
                  Route & Itinerary Visualization
                </span>
                <button
                  onClick={() => setActiveTab('map')}
                  className="text-xs text-indigo-300 hover:text-white font-medium cursor-pointer"
                >
                  Expand Full Map View ↗
                </button>
              </div>
              <GoogleMapView
                locations={parsed?.locations}
                destination={parsed?.destination}
                origin={parsed?.origin}
                duration={parsed?.duration}
                itineraryText={itinerary_info}
                locationData={parsed?.location_data}
                originLocationData={parsed?.origin_location_data}
              />
            </div>

            {/* Expense Breakdown Card */}
            <div className="not-prose">
              <ExpenseBreakdown parsed={parsed} />
            </div>

            <div className="pt-2 not-prose">
              <MarkdownRenderer content={content} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
