import React, { useState, useEffect, useMemo } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
  InfoWindow,
  useMap,
} from '@vis.gl/react-google-maps';
import {
  RotateCcw,
  ExternalLink,
  Compass,
  MapPin,
} from 'lucide-react';
import { HiddenGemItem, ItineraryDay, ItineraryStop, LiveSuggestion } from '../types';
import { formatMoney } from '../lib/storage';

export interface MapPinPoint {
  id: string;
  title: string;
  day?: number;
  timeWindow?: string;
  neighborhood?: string;
  description: string;
  category: string;
  indoorOutdoor?: string;
  estimatedCost?: number;
  lat: number;
  lon: number;
  kind: 'stop' | 'gem' | 'live' | 'hub';
}

interface GoogleMapViewProps {
  destination: string;
  country?: string;
  centerLat?: number;
  centerLon?: number;
  days: ItineraryDay[];
  hiddenGems?: HiddenGemItem[];
  liveSuggestions?: LiveSuggestion[];
  userLocation?: { lat: number; lon: number; label: string } | null;
  currency?: string;
  currencySymbol?: string;
  focusedPinId?: string | null;
  onSelectPin?: (pinId: string | null) => void;
  compact?: boolean;
}

const RoutePolyline: React.FC<{ coordinates: google.maps.LatLngLiteral[] }> = ({ coordinates }) => {
  const map = useMap();

  useEffect(() => {
    if (!map || coordinates.length < 2) return;
    const polyline = new google.maps.Polyline({
      path: coordinates,
      geodesic: true,
      strokeColor: '#22D3EE',
      strokeOpacity: 0.75,
      strokeWeight: 3,
      map,
    });
    return () => {
      polyline.setMap(null);
    };
  }, [map, coordinates]);

  return null;
};

const CameraController: React.FC<{
  pins: MapPinPoint[];
  selectedPin: MapPinPoint | null;
  triggerFit: number;
}> = ({ pins, selectedPin, triggerFit }) => {
  const map = useMap();

  useEffect(() => {
    if (!map || !selectedPin) return;
    map.panTo({ lat: selectedPin.lat, lng: selectedPin.lon });
    const currentZoom = map.getZoom();
    if (!currentZoom || currentZoom < 13) {
      map.setZoom(14);
    }
  }, [map, selectedPin]);

  useEffect(() => {
    if (!map || pins.length === 0) return;
    if (pins.length === 1) {
      map.setCenter({ lat: pins[0].lat, lng: pins[0].lon });
      map.setZoom(12);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    pins.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lon }));
    map.fitBounds(bounds, { top: 48, right: 48, bottom: 48, left: 48 });
  }, [map, pins, triggerFit]);

  return null;
};

export const GoogleMapView: React.FC<GoogleMapViewProps> = ({
  destination,
  country,
  centerLat,
  centerLon,
  days,
  hiddenGems = [],
  liveSuggestions = [],
  userLocation,
  currency = 'USD',
  currencySymbol = '$',
  focusedPinId,
  onSelectPin,
  compact = false,
}) => {
  const [activeApiKey, setActiveApiKey] = useState<string>(
    ((import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY as string) || ''
  );
  const [selectedDay, setSelectedDay] = useState<number | 'all'>('all');
  const [showGems, setShowGems] = useState<boolean>(true);
  const [selectedPin, setSelectedPin] = useState<MapPinPoint | null>(null);
  const [fitTrigger, setFitTrigger] = useState(0);

  useEffect(() => {
    if (!activeApiKey) {
      fetch('/api/maps-key')
        .then((res) => (res.ok ? res.json() : { key: '' }))
        .then((data) => {
          if (data.key) setActiveApiKey(data.key);
        })
        .catch(() => {});
    }
  }, [activeApiKey]);

  const allPins = useMemo<MapPinPoint[]>(() => {
    const list: MapPinPoint[] = [];

    for (const day of days) {
      for (const stop of day.stops || []) {
        if (typeof stop.lat === 'number' && typeof stop.lon === 'number') {
          list.push({
            id: stop.id,
            title: stop.title,
            day: day.day,
            timeWindow: stop.timeWindow,
            neighborhood: stop.neighborhood,
            description: stop.description,
            category: stop.category,
            indoorOutdoor: stop.indoorOutdoor,
            estimatedCost: stop.estimatedCost,
            lat: stop.lat,
            lon: stop.lon,
            kind: 'stop',
          });
        }
      }
    }

    for (const gem of hiddenGems) {
      if (gem.pinnedOnMap && typeof gem.lat === 'number' && typeof gem.lon === 'number') {
        list.push({
          id: gem.id,
          title: gem.title,
          neighborhood: gem.neighborhood,
          description: gem.whyLocalsLoveIt,
          category: 'hidden-gem',
          estimatedCost: gem.estimatedCost,
          lat: gem.lat,
          lon: gem.lon,
          kind: 'gem',
        });
      }
    }

    for (const live of liveSuggestions) {
      if (typeof live.lat === 'number' && typeof live.lon === 'number') {
        list.push({
          id: live.id,
          title: live.title,
          neighborhood: live.neighborhood,
          description: live.whyNow,
          category: live.category,
          indoorOutdoor: live.indoorOutdoor,
          estimatedCost: live.estimatedCost,
          lat: live.lat,
          lon: live.lon,
          kind: 'live',
        });
      }
    }

    if (list.length === 0 && typeof centerLat === 'number' && typeof centerLon === 'number') {
      list.push({
        id: 'hub-center',
        title: [destination, country].filter(Boolean).join(', ') || 'Destination Hub',
        description: 'Primary destination hub. Add itinerary stops or local hidden gems to populate route pins.',
        category: 'hub',
        lat: centerLat,
        lon: centerLon,
        kind: 'hub',
      });
    }

    return list;
  }, [days, hiddenGems, liveSuggestions, centerLat, centerLon, destination, country]);

  const visiblePins = useMemo(() => {
    return allPins.filter((pin) => {
      if (pin.kind === 'gem' && !showGems) return false;
      if (pin.kind === 'stop' && selectedDay !== 'all' && pin.day !== selectedDay) return false;
      return true;
    });
  }, [allPins, selectedDay, showGems]);

  // Sync external focus
  useEffect(() => {
    if (!focusedPinId) return;
    const match = allPins.find((p) => p.id === focusedPinId);
    if (match) {
      setSelectedPin(match);
    }
  }, [focusedPinId, allPins]);

  const routeCoords = useMemo<google.maps.LatLngLiteral[]>(() => {
    return visiblePins
      .filter((p) => p.kind === 'stop')
      .map((p) => ({ lat: p.lat, lng: p.lon }));
  }, [visiblePins]);

  const defaultCenter = useMemo(() => {
    if (typeof centerLat === 'number' && typeof centerLon === 'number') {
      return { lat: centerLat, lng: centerLon };
    }
    if (visiblePins[0]) {
      return { lat: visiblePins[0].lat, lng: visiblePins[0].lon };
    }
    return { lat: 38.7223, lng: -9.1393 };
  }, [centerLat, centerLon, visiblePins]);

  const getPinStyle = (pin: MapPinPoint) => {
    if (pin.kind === 'gem') return { bg: '#F59E0B', border: '#78350F', glyph: '#0B1120' };
    if (pin.kind === 'live') return { bg: '#10B981', border: '#064E3B', glyph: '#0B1120' };
    if (pin.kind === 'hub') return { bg: '#06B6D4', border: '#164E63', glyph: '#0B1120' };
    switch (pin.category) {
      case 'food':
        return { bg: '#F59E0B', border: '#78350F', glyph: '#0B1120' };
      case 'stay':
        return { bg: '#10B981', border: '#064E3B', glyph: '#0B1120' };
      case 'nature':
        return { bg: '#14B8A6', border: '#115E59', glyph: '#0B1120' };
      default:
        return { bg: '#22D3EE', border: '#0E7490', glyph: '#0B1120' };
    }
  };

  if (!activeApiKey) {
    return (
      <div className="w-full h-64 rounded-lg bg-[#131C2E] border border-[#24324A] flex flex-col items-center justify-center text-center px-6">
        <Compass className="w-6 h-6 text-slate-500 mb-2" />
        <p className="text-sm font-medium text-slate-300">Loading interactive route map</p>
        <p className="text-xs text-slate-500 mt-1">Waiting for Google Maps configuration...</p>
      </div>
    );
  }

  return (
    <div className="w-full rounded-lg bg-[#131C2E] border border-[#24324A] overflow-hidden flex flex-col">
      {/* Map Control Strip */}
      <div className="px-3.5 py-2.5 bg-[#0F172A] border-b border-[#24324A] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <MapPin className="w-4 h-4 text-cyan-400 shrink-0" />
          <span className="text-xs font-semibold text-slate-100 truncate">
            {destination ? `${destination} Route Map` : 'Global Trip Map'}
          </span>
          <span className="text-xs text-slate-500 font-mono tabular-nums">
            · {visiblePins.length} {visiblePins.length === 1 ? 'pin' : 'pins'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {days.length > 0 && (
            <div className="flex items-center border border-[#24324A] rounded-md overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => setSelectedDay('all')}
                className={`px-2 py-1 transition cursor-pointer ${
                  selectedDay === 'all'
                    ? 'bg-cyan-500/20 text-cyan-300 font-medium'
                    : 'bg-[#131C2E] text-slate-400 hover:text-slate-200'
                }`}
              >
                All
              </button>
              {days.map((d) => (
                <button
                  type="button"
                  key={d.day}
                  onClick={() => setSelectedDay(d.day)}
                  className={`px-2 py-1 border-l border-[#24324A] transition font-mono tabular-nums cursor-pointer ${
                    selectedDay === d.day
                      ? 'bg-cyan-500/20 text-cyan-300 font-medium'
                      : 'bg-[#131C2E] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  D{d.day}
                </button>
              ))}
            </div>
          )}

          {hiddenGems.some((g) => g.pinnedOnMap) && (
            <button
              type="button"
              onClick={() => setShowGems((v) => !v)}
              className={`px-2.5 py-1 rounded-md text-xs border transition cursor-pointer ${
                showGems
                  ? 'border-amber-500/50 bg-amber-500/10 text-amber-300'
                  : 'border-[#24324A] bg-[#131C2E] text-slate-400 hover:text-slate-200'
              }`}
            >
              Local Gems
            </button>
          )}

          <button
            type="button"
            onClick={() => setFitTrigger((v) => v + 1)}
            className="px-2.5 py-1 rounded-md text-xs border border-[#24324A] bg-[#131C2E] text-slate-300 hover:text-white hover:border-slate-500 transition flex items-center gap-1 cursor-pointer"
            title="Recenter map to fit all stops"
          >
            <RotateCcw className="w-3 h-3 text-cyan-400" />
            <span>Fit</span>
          </button>

          {destination && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([destination, country].filter(Boolean).join(', '))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1 rounded-md text-xs border border-[#24324A] bg-[#131C2E] text-slate-300 hover:text-cyan-300 transition flex items-center gap-1"
            >
              <span>Open Maps</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      {/* Map Viewport */}
      <div className={`relative w-full ${compact ? 'h-64' : 'h-80'} bg-[#0B1120]`}>
        <APIProvider apiKey={activeApiKey} solutionChannel="gmp_mcp_codeassist_v1_aistudio">
          <Map
            id="tripbuddy-cockpit-map"
            mapId="DEMO_MAP_ID"
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            defaultCenter={defaultCenter}
            defaultZoom={12}
            gestureHandling="greedy"
            fullscreenControl={true}
            streetViewControl={false}
            mapTypeControl={false}
            className="w-full h-full"
          >
            <CameraController
              pins={visiblePins}
              selectedPin={selectedPin}
              triggerFit={fitTrigger}
            />

            {routeCoords.length >= 2 && <RoutePolyline coordinates={routeCoords} />}

            {userLocation && (
              <AdvancedMarker
                position={{ lat: userLocation.lat, lng: userLocation.lon }}
                title={`Your Location: ${userLocation.label}`}
                zIndex={120}
              >
                <Pin background="#38BDF8" borderColor="#0C4A6E" glyphColor="#0B1120" scale={1.15} />
              </AdvancedMarker>
            )}

            {visiblePins.map((pin) => {
              const style = getPinStyle(pin);
              const isSelected = selectedPin?.id === pin.id;
              return (
                <AdvancedMarker
                  key={pin.id}
                  position={{ lat: pin.lat, lng: pin.lon }}
                  onClick={() => {
                    setSelectedPin(pin);
                    onSelectPin?.(pin.id);
                  }}
                  title={pin.title}
                  zIndex={isSelected ? 100 : pin.kind === 'gem' ? 40 : 20}
                >
                  <Pin
                    background={style.bg}
                    borderColor={style.border}
                    glyphColor={style.glyph}
                    scale={isSelected ? 1.3 : 1.0}
                  />
                </AdvancedMarker>
              );
            })}

            {selectedPin && (
              <InfoWindow
                position={{ lat: selectedPin.lat, lng: selectedPin.lon }}
                onCloseClick={() => {
                  setSelectedPin(null);
                  onSelectPin?.(null);
                }}
                headerContent={
                  <div className="font-semibold text-xs text-slate-900">
                    {selectedPin.title}
                  </div>
                }
              >
                <div className="text-slate-800 text-xs max-w-[230px] space-y-1.5 font-sans">
                  <div className="text-[11px] text-slate-500">
                    {[
                      selectedPin.day ? `Day ${selectedPin.day}` : selectedPin.kind === 'gem' ? 'Local Gem' : 'Nearby',
                      selectedPin.neighborhood,
                      selectedPin.estimatedCost ? formatMoney(selectedPin.estimatedCost, currency, currencySymbol) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                  <p className="text-slate-700 leading-snug">{selectedPin.description}</p>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${selectedPin.title} ${destination}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-cyan-700 hover:text-cyan-900 font-semibold text-[11px] pt-1"
                  >
                    <span>Directions in Google Maps</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </InfoWindow>
            )}
          </Map>
        </APIProvider>
      </div>
    </div>
  );
};
