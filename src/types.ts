export interface GroundingSource {
  title: string;
  url: string;
  type: 'search' | 'maps';
}

export interface ItineraryLocation {
  id: string;
  name: string;
  day: number;
  category: 'origin' | 'destination' | 'stay' | 'cafe' | 'attraction' | 'nature' | 'viewpoint';
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'stay' | 'transit';
  description: string;
  lat: number;
  lon: number;
  tags?: string[];
}

export interface ParsedTripDetails {
  destination: string;
  duration: number;
  budget: number;
  currency: string;
  interests: string[];
  origin: string;
  travel_style: string;
  dislikes: string[];
  special_preferences: string;
  location_data?: {
    name: string;
    display_name: string;
    lat: string;
    lon: string;
    country: string;
    state: string;
  } | null;
  origin_location_data?: {
    name: string;
    display_name: string;
    lat: string;
    lon: string;
    country: string;
    state: string;
  } | null;
  locations?: ItineraryLocation[];
  grounding_sources?: GroundingSource[];
  search_queries?: string[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  parsed?: ParsedTripDetails;
  flight_info?: string;
  hotel_info?: string;
  itinerary_info?: string;
  locations?: ItineraryLocation[];
  grounding_sources?: GroundingSource[];
  search_queries?: string[];
}

export type AgentNode = 'orchestrator' | 'flight_agent' | 'hotel_agent' | 'itinerary_agent' | 'synthesizer';

export interface WorkflowStep {
  node: AgentNode;
  title: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'error';
}
