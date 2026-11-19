export type WorkspaceMode = 'planning' | 'live';

export type CockpitTab = 'itinerary' | 'live' | 'budget' | 'group' | 'discover';

export type AIProviderId =
  | 'gemini-4-hydrogen'
  | 'gemini-3.1-flash-lite'
  | 'openrouter/auto'
  | 'openrouter/google/gemini-2.5-flash'
  | 'openrouter/openai/gpt-4o-mini'
  | 'openrouter/deepseek/deepseek-chat';

export interface AIModelDefinition {
  id: AIProviderId;
  label: string;
  provider: 'gemini' | 'openrouter';
  note: string;
}

export interface PaceEnergyProfile {
  wakeWindow: 'early' | 'balanced' | 'late';
  pace: 'relaxed' | 'moderate' | 'packed';
  walkingTolerance: 'low' | 'medium' | 'high';
  restBufferMinutes: number;
}

export type StopCategory =
  | 'stay'
  | 'food'
  | 'attraction'
  | 'nature'
  | 'culture'
  | 'transit'
  | 'hidden-gem'
  | 'nightlife';

export interface ItineraryStop {
  id: string;
  day: number;
  timeWindow: string;
  title: string;
  neighborhood?: string;
  description: string;
  category: StopCategory;
  indoorOutdoor: 'indoor' | 'outdoor' | 'mixed';
  estimatedCost: number;
  lat?: number;
  lon?: number;
  status: 'planned' | 'completed' | 'swapped';
  notes?: string;
  isHiddenGem?: boolean;
}

export interface ItineraryDay {
  day: number;
  title: string;
  dateLabel?: string;
  summary?: string;
  stops: ItineraryStop[];
}

export interface CustomSection {
  id: string;
  title: string;
  contentMarkdown: string;
  updatedAt: string;
}

export interface BudgetEstimate {
  flights: number;
  stay: number;
  food: number;
  activities: number;
  misc: number;
}

export type ExpenseCategory = 'flights' | 'stay' | 'food' | 'activities' | 'misc';

export interface ExpenseEntry {
  id: string;
  amount: number;
  category: ExpenseCategory;
  description: string;
  paidBy: string;
  date: string;
  splitAmong: number;
}

export interface CostAuditCategory {
  category: ExpenseCategory;
  label: string;
  userEstimated: number;
  marketLow: number;
  marketHigh: number;
  status: 'realistic' | 'tight' | 'underestimated';
  note: string;
}

export interface CostSavingSwap {
  id: string;
  title: string;
  estimatedSavings: number;
  description: string;
  actionPrompt: string;
}

export interface CostRealityCheckResult {
  verdict: 'realistic' | 'tight' | 'unrealistic';
  headline: string;
  summary: string;
  userBudget: number;
  recommendedMinimum: number;
  comfortableEstimate: number;
  currency: string;
  currencySymbol: string;
  categories: CostAuditCategory[];
  savingSwaps: CostSavingSwap[];
  sources: GroundingSource[];
  checkedAt: string;
}

export interface GroupMember {
  id: string;
  name: string;
  maxBudget: number;
  pace: 'relaxed' | 'moderate' | 'packed';
  interests: string[];
  mustHaves: string[];
  vetoes: string[];
}

export interface GroupConsensus {
  summary: string;
  sharedBudgetCeiling: number;
  commonInterests: string[];
  tradeoffsResolved: string[];
  memberNotes: { name: string; satisfiedBy: string }[];
  updatedAt: string;
}

export interface WeatherDayForecast {
  date: string;
  tempMax: number;
  tempMin: number;
  precipitationProb: number;
  weatherCode: number;
  condition: string;
  severity: 'clear' | 'mild' | 'caution' | 'disruptive';
  advisory: string;
}

export interface WeatherSnapshot {
  locationName: string;
  lat: number;
  lon: number;
  currentTemp: number;
  currentCondition: string;
  currentWindKmh: number;
  isRaining: boolean;
  daily: WeatherDayForecast[];
  fetchedAt: string;
}

export interface PlanBAlternative {
  id: string;
  title: string;
  neighborhood: string;
  category: StopCategory;
  indoorOutdoor: 'indoor' | 'outdoor' | 'mixed';
  estimatedCost: number;
  reason: string;
  openStatus: string;
  lat?: number;
  lon?: number;
}

export interface LiveSuggestion {
  id: string;
  title: string;
  neighborhood: string;
  category: StopCategory;
  indoorOutdoor: 'indoor' | 'outdoor' | 'mixed';
  estimatedMinutes: number;
  estimatedCost: number;
  whyNow: string;
  localTip?: string;
  lat?: number;
  lon?: number;
}

export interface HiddenGemItem {
  id: string;
  title: string;
  neighborhood: string;
  category: StopCategory;
  whyLocalsLoveIt: string;
  bestTime: string;
  estimatedCost: number;
  insiderTip: string;
  lat?: number;
  lon?: number;
  pinnedOnMap: boolean;
}

export interface SurprisePitch {
  id: string;
  destination: string;
  country: string;
  tagline: string;
  estimatedTotal: number;
  currency: string;
  currencySymbol: string;
  durationDays: number;
  whyItFits: string;
  highlights: string[];
  seasonNote: string;
  lat?: number;
  lon?: number;
}

export interface GroundingSource {
  title: string;
  uri: string;
  provider?: 'tavily' | 'google-search' | 'open-meteo';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  quickReplies?: string[];
  sources?: GroundingSource[];
  appliedUpdates?: string[];
  modelUsed?: string;
  localFriendMode?: boolean;
}

export interface LiveLocationContext {
  label: string;
  lat?: number;
  lon?: number;
  remainingHours: number;
  source: 'gps' | 'manual' | 'destination';
}

export interface AreaNewsItem {
  id: string;
  title: string;
  sourceName: string;
  url: string;
  publishedDate?: string;
  category: 'transit' | 'events' | 'weather' | 'closure' | 'safety' | 'local';
  severity: 'info' | 'watch' | 'alert';
  impactSummary: string;
  actionableAdvice?: string;
}

export interface AreaNewsFeed {
  locationName: string;
  summary: string;
  items: AreaNewsItem[];
  sources: GroundingSource[];
  fetchedAt: string;
}

export interface TripGuidance {
  headline: string;
  nextAction: string;
  currentStopTitle?: string;
  nextStopTitle?: string;
  transitTip: string;
  budgetCheckNote: string;
  newsHeadsUp: string;
  quickActions: string[];
  sources: GroundingSource[];
  updatedAt: string;
}

export interface TripWorkspace {
  id: string;
  title: string;
  origin: string;
  destination: string;
  country: string;
  lat?: number;
  lon?: number;
  durationDays: number;
  startDate?: string;
  currency: string;
  currencySymbol: string;
  targetBudget: number;
  travelersCount: number;
  mode: WorkspaceMode;
  localFriendMode: boolean;
  paceProfile: PaceEnergyProfile;
  days: ItineraryDay[];
  customSections: CustomSection[];
  budgetEstimate: BudgetEstimate;
  expenses: ExpenseEntry[];
  realityCheck: CostRealityCheckResult | null;
  groupMembers: GroupMember[];
  groupConsensus: GroupConsensus | null;
  weather: WeatherSnapshot | null;
  areaNews: AreaNewsFeed | null;
  activeGuidance: TripGuidance | null;
  liveSuggestions: LiveSuggestion[];
  hiddenGems: HiddenGemItem[];
  surprisePitches: SurprisePitch[];
  liveLocation: LiveLocationContext;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface TripPatch {
  title?: string;
  origin?: string;
  destination?: string;
  country?: string;
  lat?: number;
  lon?: number;
  durationDays?: number;
  startDate?: string;
  currency?: string;
  currencySymbol?: string;
  targetBudget?: number;
  travelersCount?: number;
  paceProfile?: Partial<PaceEnergyProfile>;
  days?: ItineraryDay[];
  upsertCustomSections?: CustomSection[];
  removeCustomSectionTitles?: string[];
  budgetEstimate?: Partial<BudgetEstimate>;
  addHiddenGems?: HiddenGemItem[];
}

export interface ChatTurnResponse {
  reply: string;
  quickReplies: string[];
  appliedUpdates: string[];
  tripPatch?: TripPatch;
  sources: GroundingSource[];
  modelUsed: string;
  phase: 'clarifying' | 'planning' | 'updating' | 'live-guidance';
}

export interface ServiceStatus {
  gemini: boolean;
  openrouter: boolean;
  tavily: boolean;
  maps: boolean;
  availableModels: AIModelDefinition[];
}
