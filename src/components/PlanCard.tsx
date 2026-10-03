import React, { useState } from 'react';
import { Copy, Check, Plane, Hotel, Calendar, DollarSign, Lightbulb, MapPin, Share2, Map as MapIcon, Compass } from 'lucide-react';
import { ParsedTripDetails } from '../types';
import { MockMap } from './MockMap';

interface PlanCardProps {
  content: string;
  parsed?: ParsedTripDetails;
  flight_info?: string;
  hotel_info?: string;
  itinerary_info?: string;
}

export const PlanCard: React.FC<PlanCardProps> = ({
  content,
  parsed,
  flight_info,
  hotel_info,
  itinerary_info,
}) => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'map' | 'transport' | 'stays' | 'itinerary'>('all');

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
              <span className="font-semibold text-white">{parsed.origin || 'Delhi'}</span>
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
            <span>Transport</span>
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
            <span>Stays</span>
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
            <MockMap
              locations={parsed?.locations}
              destination={parsed?.destination}
              origin={parsed?.origin}
              duration={parsed?.duration}
              itineraryText={itinerary_info}
              locationData={parsed?.location_data}
            />
          </div>
        ) : activeTab === 'transport' && flight_info ? (
          <div className="space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Plane className="w-4 h-4 text-indigo-400" />
              Transport & Route Options
            </h3>
            <div className="whitespace-pre-line text-slate-300 font-sans leading-relaxed">
              {flight_info}
            </div>
          </div>
        ) : activeTab === 'stays' && hotel_info ? (
          <div className="space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Hotel className="w-4 h-4 text-indigo-400" />
              Accommodation Recommendations
            </h3>
            <div className="whitespace-pre-line text-slate-300 font-sans leading-relaxed">
              {hotel_info}
            </div>
          </div>
        ) : activeTab === 'itinerary' && itinerary_info ? (
          <div className="space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-400" />
              Day-by-Day Personalized Itinerary
            </h3>
            <div className="whitespace-pre-line text-slate-300 font-sans leading-relaxed">
              {itinerary_info}
            </div>
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
              <MockMap
                locations={parsed?.locations}
                destination={parsed?.destination}
                origin={parsed?.origin}
                duration={parsed?.duration}
                itineraryText={itinerary_info}
                locationData={parsed?.location_data}
              />
            </div>

            <div className="whitespace-pre-line text-slate-300 font-sans leading-relaxed pt-2">
              {content}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
