import React, { useState, useMemo, useRef } from 'react';
import { 
  MapPin, 
  Navigation, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Layers, 
  Coffee, 
  Hotel, 
  Mountain, 
  Camera, 
  Calendar, 
  Compass, 
  ExternalLink,
  ChevronRight,
  Info
} from 'lucide-react';
import { ItineraryLocation, ParsedTripDetails } from '../types';

interface MockMapProps {
  locations?: ItineraryLocation[];
  destination?: string;
  origin?: string;
  duration?: number;
  itineraryText?: string;
  locationData?: ParsedTripDetails['location_data'];
}

export const MockMap: React.FC<MockMapProps> = ({
  locations: inputLocations,
  destination = 'Destination',
  origin = 'Delhi',
  duration = 5,
  itineraryText = '',
  locationData,
}) => {
  // Generate locations if not supplied or empty
  const locations: ItineraryLocation[] = useMemo(() => {
    if (inputLocations && inputLocations.length > 0) {
      return inputLocations;
    }

    // Generate intelligent mock locations based on destination and itinerary
    const centerLat = locationData?.lat ? parseFloat(locationData.lat) : 32.2396;
    const centerLon = locationData?.lon ? parseFloat(locationData.lon) : 77.1887;

    const generated: ItineraryLocation[] = [
      {
        id: 'loc-origin',
        name: `Departure: ${origin}`,
        day: 1,
        category: 'origin',
        timeOfDay: 'transit',
        description: `Starting point of your trip from ${origin} towards ${destination}.`,
        lat: centerLat - 0.25,
        lon: centerLon - 0.28,
      },
      {
        id: 'loc-stay',
        name: `${destination} Central Stay / Base`,
        day: 1,
        category: 'stay',
        timeOfDay: 'stay',
        description: `Recommended central base with easy access to cafes and transit.`,
        lat: centerLat,
        lon: centerLon,
      },
    ];

    // Create day-by-day stops
    const spots = [
      { name: 'Old Town & Artisan Cafes', cat: 'cafe', desc: 'Relaxed morning coffee, local bakery, and quiet cobbled alleys.', offset: [-0.04, 0.05], time: 'morning' },
      { name: 'Scenic Valley Viewpoint', cat: 'viewpoint', desc: 'Panoramic mountain vistas and sunset photography spot.', offset: [0.07, -0.06], time: 'afternoon' },
      { name: 'Heritage Cultural Center', cat: 'attraction', desc: 'Historic temple, architecture, and craft market.', offset: [-0.06, -0.03], time: 'morning' },
      { name: 'Pine Forest Nature Trail', cat: 'nature', desc: 'Gentle nature walk along fresh alpine streams and pine groves.', offset: [0.08, 0.04], time: 'afternoon' },
      { name: 'Riverside Evening Bazaar', cat: 'attraction', desc: 'Local delicacies, handicrafts, and ambient acoustic music.', offset: [0.02, 0.07], time: 'evening' },
      { name: 'Hidden Waterfall & Springs', cat: 'nature', desc: 'Quiet spot away from crowds for meditation and relaxation.', offset: [0.11, -0.02], time: 'morning' },
    ];

    for (let d = 1; d <= Math.min(duration, 6); d++) {
      const spotIndex = (d - 1) % spots.length;
      const s = spots[spotIndex];
      generated.push({
        id: `loc-day-${d}`,
        name: `Day ${d}: ${s.name}`,
        day: d,
        category: s.cat as any,
        timeOfDay: s.time as any,
        description: s.desc,
        lat: centerLat + s.offset[0] * (0.8 + d * 0.1),
        lon: centerLon + s.offset[1] * (0.8 + d * 0.1),
      });
    }

    return generated;
  }, [inputLocations, destination, origin, duration, locationData]);

  // Filters & State
  const [selectedDay, setSelectedDay] = useState<number | 'all'>('all');
  const [selectedLocation, setSelectedLocation] = useState<ItineraryLocation | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [mapStyle, setMapStyle] = useState<'carto' | 'terrain'>('carto');

  // Filtered spots
  const filteredLocations = useMemo(() => {
    if (selectedDay === 'all') return locations;
    return locations.filter((loc) => loc.day === selectedDay || loc.category === 'stay' || loc.category === 'origin');
  }, [locations, selectedDay]);

  // Compute bounding box for projection
  const bounds = useMemo(() => {
    if (locations.length === 0) {
      return { minLat: 0, maxLat: 1, minLon: 0, maxLon: 1 };
    }
    const lats = locations.map((l) => l.lat);
    const lons = locations.map((l) => l.lon);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const latSpan = Math.max(maxLat - minLat, 0.05);
    const lonSpan = Math.max(maxLon - minLon, 0.05);

    return {
      minLat: minLat - latSpan * 0.15,
      maxLat: maxLat + latSpan * 0.15,
      minLon: minLon - lonSpan * 0.15,
      maxLon: maxLon + lonSpan * 0.15,
    };
  }, [locations]);

  // Project lat/lon to SVG 1000 x 600 coordinate system
  const project = (lat: number, lon: number) => {
    const width = 1000;
    const height = 600;
    const x = ((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * (width - 160) + 80;
    // Invert Y so north is top
    const y = ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * (height - 140) + 70;
    return { x, y };
  };

  // Connecting route path
  const routePath = useMemo(() => {
    if (filteredLocations.length < 2) return '';
    const points = filteredLocations.map((loc) => {
      const { x, y } = project(loc.lat, loc.lon);
      return `${x},${y}`;
    });
    return `M ${points.join(' L ')}`;
  }, [filteredLocations, bounds]);

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSelectedLocation(null);
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'origin':
        return <Navigation className="w-3.5 h-3.5" />;
      case 'stay':
        return <Hotel className="w-3.5 h-3.5" />;
      case 'cafe':
        return <Coffee className="w-3.5 h-3.5" />;
      case 'nature':
      case 'viewpoint':
        return <Mountain className="w-3.5 h-3.5" />;
      default:
        return <Camera className="w-3.5 h-3.5" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'origin':
        return 'bg-amber-500 text-slate-950 border-amber-300';
      case 'stay':
        return 'bg-indigo-600 text-white border-indigo-400';
      case 'cafe':
        return 'bg-rose-500 text-white border-rose-300';
      case 'nature':
      case 'viewpoint':
        return 'bg-emerald-500 text-slate-950 border-emerald-300';
      default:
        return 'bg-sky-500 text-slate-950 border-sky-300';
    }
  };

  return (
    <div className="rounded-2xl border border-slate-700/80 bg-slate-950 shadow-2xl overflow-hidden flex flex-col my-4">
      {/* Map Control Header */}
      <div className="p-4 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
            <Compass className="w-4 h-4 animate-spin-slow" />
          </div>
          <div>
            <h4 className="font-bold text-white text-sm flex items-center gap-1.5">
              <span>{destination} Itinerary Map</span>
              <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-mono">
                {locations.length} Locations
              </span>
            </h4>
            <p className="text-[11px] text-slate-400">
              Interactive route & highlights visualization
            </p>
          </div>
        </div>

        {/* Day Filter Pills */}
        <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-lg border border-slate-700 overflow-x-auto">
          <button
            onClick={() => setSelectedDay('all')}
            className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
              selectedDay === 'all'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All Days
          </button>
          {Array.from({ length: Math.min(duration, 6) }, (_, i) => i + 1).map((d) => (
            <button
              key={d}
              onClick={() => setSelectedDay(d)}
              className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer shrink-0 ${
                selectedDay === d
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Day {d}
            </button>
          ))}
        </div>

        {/* Map View toggles & controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setMapStyle(mapStyle === 'carto' ? 'terrain' : 'carto')}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition flex items-center gap-1 cursor-pointer"
            title="Toggle Map Style"
          >
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            <span className="capitalize">{mapStyle}</span>
          </button>
          <div className="flex items-center gap-1 bg-slate-800/80 rounded-lg p-0.5 border border-slate-700">
            <button
              onClick={() => setZoom((z) => Math.min(z + 0.25, 2.5))}
              className="p-1.5 rounded-md hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoom((z) => Math.max(z - 0.25, 0.75))}
              className="p-1.5 rounded-md hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleReset}
              className="p-1.5 rounded-md hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
              title="Reset View"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Map Canvas Area */}
      <div className="relative h-[480px] w-full bg-slate-950 overflow-hidden select-none cursor-grab active:cursor-grabbing">
        {/* SVG Interactive Map */}
        <div
          className="absolute inset-0 w-full h-full"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <svg
            viewBox="0 0 1000 600"
            className="w-full h-full transition-transform duration-75"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
            }}
          >
            <defs>
              {/* Grid pattern */}
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(51, 65, 85, 0.25)" strokeWidth="0.8" />
              </pattern>
              
              {/* Topographic accent pattern */}
              <pattern id="contours" width="200" height="200" patternUnits="userSpaceOnUse">
                <path
                  d="M 0 50 Q 50 10 100 50 T 200 50 M 0 100 Q 50 70 100 120 T 200 100 M 0 150 Q 70 180 140 130 T 200 160"
                  fill="none"
                  stroke={mapStyle === 'terrain' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(99, 102, 241, 0.12)'}
                  strokeWidth="1.2"
                />
              </pattern>

              {/* Glow filter for active route */}
              <filter id="routeGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Background fills */}
            <rect width="1000" height="600" fill={mapStyle === 'terrain' ? '#091312' : '#0b0f19'} />
            <rect width="1000" height="600" fill="url(#grid)" />
            <rect width="1000" height="600" fill="url(#contours)" />

            {/* Stylized geography shapes (waterways & landscape) */}
            <path
              d="M 50 300 Q 250 200 450 350 T 850 280 T 950 450"
              fill="none"
              stroke={mapStyle === 'terrain' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(99, 102, 241, 0.18)'}
              strokeWidth="24"
              strokeLinecap="round"
            />
            <path
              d="M 120 400 Q 300 480 600 420 T 900 500"
              fill="none"
              stroke="rgba(148, 163, 184, 0.08)"
              strokeWidth="12"
              strokeDasharray="6 4"
            />

            {/* Route Polyline */}
            {routePath && (
              <>
                <path
                  d={routePath}
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth="5"
                  strokeOpacity="0.4"
                  filter="url(#routeGlow)"
                />
                <path
                  d={routePath}
                  fill="none"
                  stroke="#818cf8"
                  strokeWidth="2.5"
                  strokeDasharray="8 6"
                  className="animate-pulse"
                />
              </>
            )}

            {/* Location Markers */}
            {filteredLocations.map((loc) => {
              const { x, y } = project(loc.lat, loc.lon);
              const isSelected = selectedLocation?.id === loc.id;

              return (
                <g
                  key={loc.id}
                  transform={`translate(${x}, ${y})`}
                  className="cursor-pointer group"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedLocation(loc);
                  }}
                >
                  {/* Outer pulse when selected */}
                  {isSelected && (
                    <circle r="22" fill="none" stroke="#818cf8" strokeWidth="2" className="animate-ping opacity-75" />
                  )}

                  {/* Marker Pin Base */}
                  <circle
                    r={isSelected ? '16' : '13'}
                    className={`transition-all duration-200 ${
                      isSelected
                        ? 'fill-indigo-500 stroke-white'
                        : loc.category === 'origin'
                        ? 'fill-amber-500 stroke-slate-900'
                        : loc.category === 'stay'
                        ? 'fill-indigo-600 stroke-indigo-300'
                        : 'fill-slate-800 stroke-slate-400 group-hover:fill-indigo-700'
                    }`}
                    strokeWidth="2.5"
                  />

                  {/* Text Badge inside Pin */}
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#ffffff"
                    fontSize={isSelected ? '11' : '10'}
                    fontWeight="bold"
                    fontFamily="monospace"
                  >
                    {loc.category === 'origin' ? '✈️' : loc.category === 'stay' ? '🏨' : `D${loc.day}`}
                  </text>

                  {/* Hover Tag label */}
                  <g className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <rect
                      x="-60"
                      y="-40"
                      width="120"
                      height="24"
                      rx="6"
                      fill="#0f172a"
                      stroke="#475569"
                      strokeWidth="1"
                    />
                    <text
                      x="0"
                      y="-25"
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="#f8fafc"
                      fontSize="10"
                      fontWeight="600"
                    >
                      {loc.name.slice(0, 18)}
                    </text>
                  </g>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Compass Rose */}
        <div className="absolute top-4 right-4 bg-slate-900/80 backdrop-blur border border-slate-800 p-2 rounded-xl text-center shadow-lg pointer-events-none">
          <div className="w-8 h-8 rounded-full border border-slate-700 flex flex-col items-center justify-center font-mono text-[9px] text-slate-300">
            <span className="font-bold text-rose-400">N</span>
            <span className="text-[7px] text-slate-500">▲</span>
          </div>
        </div>

        {/* Selected Location Card Popover */}
        {selectedLocation && (
          <div className="absolute bottom-4 left-4 right-4 sm:right-auto sm:max-w-md bg-slate-900/95 backdrop-blur border border-indigo-500/40 rounded-xl p-4 shadow-2xl z-20 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold border ${getCategoryColor(
                    selectedLocation.category
                  )}`}
                >
                  {getCategoryIcon(selectedLocation.category)}
                </span>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono uppercase">
                      Day {selectedLocation.day} • {selectedLocation.timeOfDay}
                    </span>
                    <span className="text-[10px] text-slate-400 capitalize">
                      {selectedLocation.category}
                    </span>
                  </div>
                  <h5 className="font-bold text-white text-sm mt-0.5">
                    {selectedLocation.name}
                  </h5>
                </div>
              </div>
              <button
                onClick={() => setSelectedLocation(null)}
                className="text-slate-400 hover:text-white text-xs p-1 rounded-md hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {selectedLocation.description}
            </p>

            <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-800 text-slate-400">
              <span className="font-mono">
                Lat: {selectedLocation.lat.toFixed(4)}, Lon: {selectedLocation.lon.toFixed(4)}
              </span>
              <button
                onClick={() => {
                  const { x, y } = project(selectedLocation.lat, selectedLocation.lon);
                  setPan({ x: 500 - x, y: 300 - y });
                  setZoom(1.5);
                }}
                className="text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <span>Center on pin</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="absolute top-4 left-4 bg-slate-900/80 backdrop-blur border border-slate-800 px-3 py-2 rounded-xl text-[11px] shadow-lg flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
            <span className="text-slate-400">Transit</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
            <span className="text-slate-400">Stays</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-400"></span>
            <span className="text-slate-400">Daily Stops</span>
          </div>
        </div>
      </div>

      {/* Itinerary Timeline Stops List */}
      <div className="p-4 bg-slate-900/60 border-t border-slate-800">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
          Stops along your itinerary (Click to focus pin)
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {locations.map((loc) => {
            const isSelected = selectedLocation?.id === loc.id;
            return (
              <button
                key={loc.id}
                onClick={() => {
                  setSelectedLocation(loc);
                  const { x, y } = project(loc.lat, loc.lon);
                  setPan({ x: 500 - x, y: 300 - y });
                  setZoom(1.4);
                }}
                className={`p-2.5 rounded-xl border text-left transition flex items-center justify-between gap-2 cursor-pointer ${
                  isSelected
                    ? 'bg-indigo-950/60 border-indigo-500/80 text-white'
                    : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span
                    className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-xs border ${getCategoryColor(
                      loc.category
                    )}`}
                  >
                    {getCategoryIcon(loc.category)}
                  </span>
                  <div className="truncate">
                    <span className="text-xs font-semibold block truncate">
                      {loc.name}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Day {loc.day} • {loc.timeOfDay}
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
