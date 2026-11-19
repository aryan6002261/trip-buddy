import type { TripWorkspace } from '../types.js';

const STORAGE_KEY = 'tripbuddy_workspaces_v2';
const ACTIVE_ID_KEY = 'tripbuddy_active_workspace_v2';
const MODEL_KEY = 'tripbuddy_selected_model_v2';

export const CURRENCY_MAP: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  INR: '₹',
  AUD: 'A$',
  CAD: 'C$',
  SGD: 'S$',
  CHF: 'CHF ',
  THB: '฿',
  MXN: 'MX$',
  KRW: '₩',
  AED: 'AED ',
  NZD: 'NZ$',
  BRL: 'R$',
  ZAR: 'R',
};

export function getCurrencySymbol(code?: string): string {
  if (!code) return '$';
  const upper = code.toUpperCase().trim();
  return CURRENCY_MAP[upper] || `${upper} `;
}

export function formatMoney(amount: number, currency = 'USD', symbol?: string): string {
  const safeAmount = Number.isFinite(amount) ? Math.round(amount) : 0;
  const sym = symbol || getCurrencySymbol(currency);
  const formatted = Math.abs(safeAmount).toLocaleString('en-US');
  return safeAmount < 0 ? `-${sym}${formatted}` : `${sym}${formatted}`;
}

export function createNewWorkspace(partial?: Partial<TripWorkspace>): TripWorkspace {
  const now = new Date().toISOString();
  const id = `trip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  return {
    id,
    title: partial?.title || 'Untitled Global Trip',
    origin: partial?.origin || '',
    destination: partial?.destination || '',
    country: partial?.country || '',
    lat: partial?.lat,
    lon: partial?.lon,
    durationDays: partial?.durationDays || 0,
    startDate: partial?.startDate || '',
    currency: partial?.currency || 'USD',
    currencySymbol: partial?.currencySymbol || getCurrencySymbol(partial?.currency || 'USD'),
    targetBudget: partial?.targetBudget || 0,
    travelersCount: partial?.travelersCount || 1,
    mode: partial?.mode || 'planning',
    localFriendMode: partial?.localFriendMode ?? false,
    paceProfile: partial?.paceProfile || {
      wakeWindow: 'balanced',
      pace: 'moderate',
      walkingTolerance: 'medium',
      restBufferMinutes: 45,
    },
    days: partial?.days || [],
    customSections: partial?.customSections || [],
    budgetEstimate: partial?.budgetEstimate || {
      flights: 0,
      stay: 0,
      food: 0,
      activities: 0,
      misc: 0,
    },
    expenses: partial?.expenses || [],
    realityCheck: partial?.realityCheck || null,
    groupMembers: partial?.groupMembers || [],
    groupConsensus: partial?.groupConsensus || null,
    weather: partial?.weather || null,
    liveSuggestions: partial?.liveSuggestions || [],
    hiddenGems: partial?.hiddenGems || [],
    surprisePitches: partial?.surprisePitches || [],
    liveLocation: partial?.liveLocation || {
      label: partial?.destination || '',
      lat: partial?.lat,
      lon: partial?.lon,
      remainingHours: 4,
      source: 'destination',
    },
    messages: partial?.messages || [
      {
        id: `msg-welcome-${Date.now()}`,
        role: 'assistant',
        timestamp: now,
        content:
          "Where in the world are you thinking of heading — or would you rather tell me your budget, departure city, and vibe so we can explore ideas together?\n\nI'll ask a few quick questions first before building anything, and I only add sections you actually care about.",
        quickReplies: [
          '5 days in Lisbon from London — food & hidden neighborhoods',
          '7 days in Tokyo from San Francisco — late riser, coffee & architecture',
          'Long weekend in Oaxaca — street food & mezcal on a $900 budget',
          'Not sure where to go — help me pick somewhere unexpected',
        ],
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

export function loadWorkspaces(): TripWorkspace[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function saveWorkspaces(workspaces: TripWorkspace[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workspaces));
  } catch (err) {
    console.warn('Could not persist workspaces to localStorage:', err);
  }
}

export function loadActiveWorkspaceId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_ID_KEY);
  } catch {
    return null;
  }
}

export function saveActiveWorkspaceId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_ID_KEY, id);
  } catch {
    // ignore storage quota errors
  }
}

export function loadSelectedModel(): string | null {
  try {
    return localStorage.getItem(MODEL_KEY);
  } catch {
    return null;
  }
}

export function saveSelectedModel(modelId: string): void {
  try {
    localStorage.setItem(MODEL_KEY, modelId);
  } catch {
    // ignore
  }
}
