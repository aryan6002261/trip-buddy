import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
  InfoWindow,
  useMap,
} from '@vis.gl/react-google-maps';
import {
  Navigation,
  MapPin,
  Hotel,
  Coffee,
  Mountain,
  Camera,
  Layers,
  RotateCcw,
  ExternalLink,
  Compass,
  Sparkles,
  ChevronRight,
} from 'lucide-react';
import { ItineraryLocation, ParsedTripDetails } from '../types';

interface GoogleMapViewProps {
  locations?: ItineraryLocation[];
  destination?: string;
  origin?: string;
  duration?: number;
  itineraryText?: string;
  locationData?: ParsedTripDetails['location_data'];
  originLocationData?: ParsedTripDetails['origin_location_data'];
  apiKey?: string;
}

// Polyline Route renderer inside the Map context
const RoutePolyline: React.FC<{ coordinates: google.maps.LatLngLiteral[] }> = ({ coordinates }) => {
  const map = useMap();

  useEffect(() => {
    if (!map || coordinates.length < 2) return;

    const polyline = new google.maps.Polyline({
      path: coordinates,
      geodesic: true,
      strokeColor: '#6366f1',
      strokeOpacity: 0.85,
      strokeWeight: 4,
      map,
    });

    return () => {
      polyline.setMap(null);
    };
  }, [map, coordinates]);

  return null;
};

// Camera Controller for Fit Bounds
const CameraController: React.FC<{
  locations: ItineraryLocation[];
  selectedLocation: ItineraryLocation | null;
  triggerFit: number;
}> = ({ locations, selectedLocation, triggerFit }) => {
  const map = useMap();

  // Focus selected stop
  useEffect(() => {
    if (!map || !selectedLocation) return;
    map.panTo({ lat: selectedLocation.lat, lng: selectedLocation.lon });
    if (map.getZoom() && map.getZoom()! < 12) {
      map.setZoom(13);
    }
  }, [map, selectedLocation]);

  // Fit all stops
  useEffect(() => {
    if (!map || locations.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    locations.forEach((loc) => {
      bounds.extend({ lat: loc.lat, lng: loc.lon });
    });
    map.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: 60 });
  }, [map, locations, triggerFit]);

  return null;
};

export const GoogleMapView: React.FC<GoogleMapViewProps> = ({
  locations: inputLocations,
  destination = 'Destination',
  origin = 'Flexible',
  duration = 5,
  locationData,
  originLocationData,
  apiKey: propApiKey,
}) => {
  const [activeApiKey, setActiveApiKey] = useState<string>(
    propApiKey || ((import.meta as any).env.VITE_GOOGLE_MAPS_API_KEY as string) || ''
  );
  const [selectedDay, setSelectedDay] = useState<number | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedLocation, setSelectedLocation] = useState<ItineraryLocation | null>(null);
  const [fitTrigger, setFitTrigger] = useState(0);

  // Fetch API key dynamically from server if not in env
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

  // Build structured locations list
  const locations: ItineraryLocation[] = useMemo(() => {
    if (inputLocations && inputLocations.length > 0) {
      return inputLocations;
    }

    const centerLat = locationData?.lat ? parseFloat(locationData.lat) : 26.9124;
    const centerLon = locationData?.lon ? parseFloat(locationData.lon) : 75.7873;

    const list: ItineraryLocation[] = [];

    // 1. Origin marker if specified and geocoded
    if (origin && origin !== 'Flexible' && origin !== 'Delhi' && originLocationData?.lat) {
      list.push({
        id: 'loc-origin',
        name: `Departure: ${origin}`,
        day: 1,
        category: 'origin',
        timeOfDay: 'transit',
        description: `Starting city for this trip. Departure towards ${destination}.`,
        lat: parseFloat(originLocationData.lat),
        lon: parseFloat(originLocationData.lon),
      });
    }

    // 2. Destination Center base marker
    list.push({
      id: 'loc-dest',
      name: `${destination} City Center & Base`,
      day: 1,
      category: 'stay',
      timeOfDay: 'stay',
      description: `Central hub in ${destination}. Easy connection to top attractions, local food, and cultural walks.`,
      lat: centerLat,
      lon: centerLon,
    });

    // 3. Day-by-day key sights
    const templates = [
      { name: 'Heritage Palace & Cultural Quarter', cat: 'attraction', desc: 'Historic royal architecture, intricate carvings, and museum courtyards.', offset: [-0.015, 0.02], time: 'morning' },
      { name: 'Panoramic Hilltop Viewpoint', cat: 'viewpoint', desc: 'Elevated scenic overlook with panoramic sunset photography views.', offset: [0.03, -0.025], time: 'afternoon' },
      { name: 'Old Bazaar & Artisan Eateries', cat: 'cafe', desc: 'Vibrant local food street, traditional crafts, tea stalls, and textiles.', offset: [-0.02, -0.015], time: 'evening' },
      { name: 'Historic Stepwell & Water Garden', cat: 'attraction', desc: 'Ancient geometric stepwell structure with tranquil water gardens.', offset: [0.035, 0.03], time: 'morning' },
      { name: 'Serene Botanical Grove & Lake Walk', cat: 'nature', desc: 'Lakeside promenade, botanical flora, and peaceful walking trails.', offset: [0.01, 0.04], time: 'afternoon' },
      { name: 'Cultural Arts & Twilight Market', cat: 'attraction', desc: 'Acoustic music performances, local delicacies, and illuminated courtyards.', offset: [-0.03, 0.01], time: 'evening' },
    ];

    const count = Math.min(Math.max(duration, 3), 7);
    for (let d = 1; d <= count; d++) {
      const t = templates[(d - 1) % templates.length];
      list.push({
        id: `loc-day-${d}`,
        name: `Day ${d}: ${t.name}`,
        day: d,
        category: t.cat as any,
        timeOfDay: t.time as any,
        description: t.desc,
        lat: centerLat + t.offset[0] * (0.8 + d * 0.1),
        lon: centerLon + t.offset[1] * (0.8 + d * 0.1),
      });
    }

    return list;
  }, [inputLocations, destination, origin, duration, locationData, originLocationData]);

  // Filtered locations
  const filteredLocations = useMemo(() => {
    return locations.filter((loc) => {
      const matchDay = selectedDay === 'all' || loc.day === selectedDay || loc.category === 'origin';
      const matchCat =
        selectedCategory === 'all' ||
        (selectedCategory === 'stays' && loc.category === 'stay') ||
        (selectedCategory === 'sights' && (loc.category === 'attraction' || loc.category === 'viewpoint')) ||
        (selectedCategory === 'food' && loc.category === 'cafe') ||
        (selectedCategory === 'nature' && loc.category === 'nature');
      return matchDay && matchCat;
    });
  }, [locations, selectedDay, selectedCategory]);

  // Polyline coordinates
  const polylineCoords: google.maps.LatLngLiteral[] = useMemo(() => {
    return filteredLocations.map((l) => ({ lat: l.lat, lng: l.lon }));
  }, [filteredLocations]);

  const centerLat = locationData?.lat ? parseFloat(locationData.lat) : 26.9124;
  const centerLon = locationData?.lon ? parseFloat(locationData.lon) : 75.7873;

  const getPinColor = (cat: string) => {
    switch (cat) {
      case 'origin':
        return { bg: '#3b82f6', border: '#1e3a8a', glyph: '#ffffff' };
      case 'stay':
        return { bg: '#10b981', border: '#064e3b', glyph: '#ffffff' };
      case 'cafe':
        return { bg: '#f59e0b', border: '#78350f', glyph: '#ffffff' };
      case 'nature':
      case 'viewpoint':
        return { bg: '#06b6d4', border: '#164e63', glyph: '#ffffff' };
      default:
        return { bg: '#6366f1', border: '#312e81', glyph: '#ffffff' };
    }
  };

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'origin':
        return <Navigation className="w-3.5 h-3.5 text-blue-400" />;
      case 'stay':
        return <Hotel className="w-3.5 h-3.5 text-emerald-400" />;
      case 'cafe':
        return <Coffee className="w-3.5 h-3.5 text-amber-400" />;
      case 'nature':
        return <Mountain className="w-3.5 h-3.5 text-teal-400" />;
      case 'viewpoint':
        return <Camera className="w-3.5 h-3.5 text-cyan-400" />;
      default:
        return <MapPin className="w-3.5 h-3.5 text-indigo-400" />;
    }
  };

  return (
    <div className="w-full rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl overflow-hidden flex flex-col">
      {/* Header & Controls Toolbar */}
      <div className="p-3.5 bg-slate-950/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Compass className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
              <span>{destination} Interactive Route Map</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                Google Maps
              </span>
            </h4>
            <p className="text-xs text-slate-400">
              {origin && origin !== 'Flexible' ? `From ${origin} to ${destination}` : `${destination} highlights & day stops`}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFitTrigger((prev) => prev + 1)}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 hover:text-white border border-slate-700 transition flex items-center gap-1.5 cursor-pointer shadow-sm"
            title="Recenter and fit all stops into view"
          >
            <RotateCcw className="w-3.5 h-3.5 text-indigo-400" />
            <span>Fit Stops</span>
          </button>

          <a
            href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin === 'Flexible' ? destination : origin)}&destination=${encodeURIComponent(destination)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <span>Google Maps</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Filter Chips Bar */}
      <div className="px-3 py-2 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between gap-2 overflow-x-auto text-xs">
        {/* Day selection */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[11px] text-slate-400 mr-1 font-medium">Day:</span>
          <button
            onClick={() => setSelectedDay('all')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
              selectedDay === 'all'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            All
          </button>
          {Array.from({ length: Math.min(duration, 7) }, (_, i) => i + 1).map((d) => (
            <button
              key={d}
              onClick={() => setSelectedDay(d)}
              className={`px-2 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
                selectedDay === d
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              D{d}
            </button>
          ))}
        </div>

        {/* Category selection */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[11px] text-slate-400 mr-1 font-medium">Category:</span>
          {[
            { id: 'all', label: 'All' },
            { id: 'stays', label: 'Stays' },
            { id: 'sights', label: 'Sights' },
            { id: 'food', label: 'Food' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-2 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
                selectedCategory === cat.id
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Google Map Container */}
      <div className="relative w-full h-[460px] bg-slate-950">
        <APIProvider apiKey={activeApiKey} solutionChannel="gmp_mcp_codeassist_v1_aistudio">
          <Map
            id="tripbuddy-interactive-map"
            mapId="DEMO_MAP_ID"
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            defaultCenter={{ lat: centerLat, lng: centerLon }}
            defaultZoom={11}
            gestureHandling="greedy"
            disableDefaultUI={false}
            fullscreenControl={true}
            streetViewControl={true}
            mapTypeControl={true}
            className="w-full h-full"
          >
            {/* Camera & Bounds sync */}
            <CameraController
              locations={filteredLocations}
              selectedLocation={selectedLocation}
              triggerFit={fitTrigger}
            />

            {/* Polyline Route connecting itinerary stops */}
            {polylineCoords.length >= 2 && <RoutePolyline coordinates={polylineCoords} />}

            {/* Advanced Markers */}
            {filteredLocations.map((loc) => {
              const colors = getPinColor(loc.category);
              const isSelected = selectedLocation?.id === loc.id;

              return (
                <AdvancedMarker
                  key={loc.id}
                  position={{ lat: loc.lat, lng: loc.lon }}
                  onClick={() => setSelectedLocation(loc)}
                  title={loc.name}
                  zIndex={isSelected ? 100 : loc.category === 'origin' ? 50 : 10}
                >
                  <Pin
                    background={colors.bg}
                    borderColor={colors.border}
                    glyphColor={colors.glyph}
                    scale={isSelected ? 1.35 : loc.category === 'origin' ? 1.25 : 1.05}
                  />
                </AdvancedMarker>
              );
            })}

            {/* InfoWindow on Marker Click */}
            {selectedLocation && (
              <InfoWindow
                position={{ lat: selectedLocation.lat, lng: selectedLocation.lon }}
                onCloseClick={() => setSelectedLocation(null)}
                headerContent={
                  <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                    {getCategoryIcon(selectedLocation.category)}
                    <span>{selectedLocation.name}</span>
                  </div>
                }
              >
                <div className="text-slate-800 text-xs max-w-[240px] space-y-2 p-1 font-sans">
                  <div className="flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-semibold text-[10px] uppercase">
                      {selectedLocation.category}
                    </span>
                    <span className="text-[11px] text-slate-500">Day {selectedLocation.day}</span>
                  </div>

                  <p className="text-slate-600 leading-snug">{selectedLocation.description}</p>

                  <div className="pt-1 border-t border-slate-200 flex items-center justify-between">
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedLocation.name + ' ' + destination)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:text-indigo-800 font-semibold text-[11px] inline-flex items-center gap-1"
                    >
                      <span>Explore on Maps</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </InfoWindow>
            )}
          </Map>
        </APIProvider>
      </div>

      {/* Interactive Stops Strip (Click to fly & view) */}
      <div className="p-3 bg-slate-950 border-t border-slate-800/80">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-indigo-400" />
            Curated Trip Stops ({filteredLocations.length})
          </span>
          <span className="text-[11px] text-slate-500">Click stop to focus</span>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {filteredLocations.map((loc) => {
            const isSelected = selectedLocation?.id === loc.id;
            return (
              <button
                key={loc.id}
                onClick={() => setSelectedLocation(loc)}
                className={`p-2 rounded-xl text-left border transition shrink-0 w-48 cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'bg-indigo-950/70 border-indigo-500/80 shadow-md ring-1 ring-indigo-500/50'
                    : 'bg-slate-900/80 hover:bg-slate-800/90 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-medium text-indigo-300 flex items-center gap-1">
                      {getCategoryIcon(loc.category)}
                      Day {loc.day}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 uppercase">
                      {loc.category}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-white line-clamp-1">{loc.name}</div>
                  <div className="text-[11px] text-slate-400 line-clamp-2 mt-0.5 leading-relaxed">
                    {loc.description}
                  </div>
                </div>
                <div className="mt-2 text-[10px] text-indigo-400 font-medium flex items-center gap-0.5">
                  <span>View Details</span>
                  <ChevronRight className="w-2.5 h-2.5" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
