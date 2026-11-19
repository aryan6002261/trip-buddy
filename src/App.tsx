import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus,
  Printer,
  Coffee,
  Compass,
  Navigation,
  Wallet,
  Users,
  Sparkles,
  Trash2,
  Map as MapIcon,
} from 'lucide-react';
import {
  AIModelDefinition,
  AIProviderId,
  ChatMessage,
  ChatTurnResponse,
  CockpitTab,
  ExpenseEntry,
  GroupMember,
  HiddenGemItem,
  ItineraryStop,
  LiveSuggestion,
  PaceEnergyProfile,
  PlanBAlternative,
  ServiceStatus,
  SurprisePitch,
  TripPatch,
  TripWorkspace,
  WorkspaceMode,
} from './types';
import {
  createNewWorkspace,
  formatMoney,
  getCurrencySymbol,
  loadActiveWorkspaceId,
  loadSelectedModel,
  loadWorkspaces,
  saveActiveWorkspaceId,
  saveSelectedModel,
  saveWorkspaces,
} from './lib/storage';
import { ChatPane } from './components/ChatPane';
import { ItineraryMapPanel } from './components/ItineraryMapPanel';
import { LiveCompanionPanel } from './components/LiveCompanionPanel';
import { BudgetRealityPanel } from './components/BudgetRealityPanel';
import { GroupDecisionPanel } from './components/GroupDecisionPanel';
import { DiscoverPanel } from './components/DiscoverPanel';
import { PrintableTripView } from './components/PrintableTripView';

function applyTripPatch(trip: TripWorkspace, patch?: TripPatch): TripWorkspace {
  if (!patch) return trip;
  const next: TripWorkspace = {
    ...trip,
    updatedAt: new Date().toISOString(),
  };

  if (patch.title) next.title = patch.title;
  if (patch.origin) next.origin = patch.origin;
  if (patch.destination) {
    next.destination = patch.destination;
    if (!next.liveLocation.label || next.liveLocation.source === 'destination') {
      next.liveLocation = {
        ...next.liveLocation,
        label: [patch.destination, patch.country || next.country].filter(Boolean).join(', '),
        lat: patch.lat ?? next.lat,
        lon: patch.lon ?? next.lon,
        source: 'destination',
      };
    }
    if (next.title === 'Untitled Global Trip') {
      next.title = `${patch.destination}${patch.durationDays ? ` · ${patch.durationDays}d` : ''}`;
    }
  }
  if (patch.country) next.country = patch.country;
  if (typeof patch.lat === 'number') next.lat = patch.lat;
  if (typeof patch.lon === 'number') next.lon = patch.lon;
  if (typeof patch.durationDays === 'number' && patch.durationDays > 0) {
    next.durationDays = patch.durationDays;
  }
  if (patch.startDate) next.startDate = patch.startDate;
  if (patch.currency) {
    next.currency = patch.currency.toUpperCase();
    next.currencySymbol = patch.currencySymbol || getCurrencySymbol(patch.currency);
  }
  if (typeof patch.targetBudget === 'number' && patch.targetBudget > 0) {
    next.targetBudget = patch.targetBudget;
  }
  if (typeof patch.travelersCount === 'number' && patch.travelersCount > 0) {
    next.travelersCount = patch.travelersCount;
  }
  if (patch.paceProfile) {
    next.paceProfile = { ...next.paceProfile, ...patch.paceProfile };
  }
  if (patch.budgetEstimate) {
    next.budgetEstimate = {
      ...next.budgetEstimate,
      ...patch.budgetEstimate,
    };
  }
  if (Array.isArray(patch.days) && patch.days.length > 0) {
    next.days = patch.days;
    if (!next.durationDays) next.durationDays = patch.days.length;
  }
  if (Array.isArray(patch.upsertCustomSections) && patch.upsertCustomSections.length > 0) {
    const updated = [...next.customSections];
    for (const incoming of patch.upsertCustomSections) {
      const idx = updated.findIndex(
        (s) => s.id === incoming.id || s.title.toLowerCase() === incoming.title.toLowerCase()
      );
      if (idx >= 0) {
        updated[idx] = incoming;
      } else {
        updated.push(incoming);
      }
    }
    next.customSections = updated;
  }
  if (Array.isArray(patch.removeCustomSectionTitles) && patch.removeCustomSectionTitles.length > 0) {
    const lowerSet = new Set(patch.removeCustomSectionTitles.map((t) => t.toLowerCase()));
    next.customSections = next.customSections.filter((s) => !lowerSet.has(s.title.toLowerCase()));
  }
  if (Array.isArray(patch.addHiddenGems) && patch.addHiddenGems.length > 0) {
    const existingNames = new Set(next.hiddenGems.map((g) => g.title.toLowerCase()));
    const fresh = patch.addHiddenGems.filter((g) => !existingNames.has(g.title.toLowerCase()));
    next.hiddenGems = [...fresh, ...next.hiddenGems];
  }

  return next;
}

export default function App() {
  const [workspaces, setWorkspaces] = useState<TripWorkspace[]>(() => {
    const loaded = loadWorkspaces();
    return loaded.length > 0 ? loaded : [createNewWorkspace()];
  });

  const [activeId, setActiveId] = useState<string>(() => {
    const savedId = loadActiveWorkspaceId();
    const loaded = loadWorkspaces();
    if (savedId && loaded.some((w) => w.id === savedId)) return savedId;
    return loaded[0]?.id || '';
  });

  const [activeTab, setActiveTab] = useState<CockpitTab>('itinerary');
  const [mobilePane, setMobilePane] = useState<'chat' | 'cockpit'>('chat');

  const [availableModels, setAvailableModels] = useState<AIModelDefinition[]>([
    {
      id: 'gemini-4-hydrogen',
      label: 'Gemini 4 Hydrogen',
      provider: 'gemini',
      note: 'Deep conversational planner & Search grounding',
    },
  ]);
  const [selectedModel, setSelectedModel] = useState<AIProviderId>(
    () => (loadSelectedModel() as AIProviderId) || 'gemini-4-hydrogen'
  );

  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isPanelBusy, setIsPanelBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Plan B ephemeral UI state
  const [planBTarget, setPlanBTarget] = useState<ItineraryStop | null>(null);
  const [planBResults, setPlanBResults] = useState<PlanBAlternative[]>([]);
  const [planBNote, setPlanBNote] = useState<string | null>(null);

  // Keep activeId valid
  useEffect(() => {
    if (!workspaces.some((w) => w.id === activeId) && workspaces[0]) {
      setActiveId(workspaces[0].id);
    }
  }, [workspaces, activeId]);

  // Persist workspaces & activeId in localStorage
  useEffect(() => {
    saveWorkspaces(workspaces);
  }, [workspaces]);

  useEffect(() => {
    if (activeId) saveActiveWorkspaceId(activeId);
  }, [activeId]);

  useEffect(() => {
    saveSelectedModel(selectedModel);
  }, [selectedModel]);

  // Load backend provider/model capabilities once
  useEffect(() => {
    fetch('/api/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ServiceStatus | null) => {
        if (data?.availableModels && data.availableModels.length > 0) {
          setAvailableModels(data.availableModels);
          const topModel = data.availableModels[0];
          const savedExists = data.availableModels.some((m) => m.id === selectedModel);
          if (
            !savedExists ||
            (topModel.provider === 'openrouter' && !selectedModel.startsWith('openrouter/'))
          ) {
            setSelectedModel(topModel.id);
          }
        }
      })
      .catch(() => {});
  }, []);

  const activeTrip = useMemo(
    () => workspaces.find((w) => w.id === activeId) || workspaces[0],
    [workspaces, activeId]
  );

  const updateActiveTrip = useCallback(
    (updater: (prev: TripWorkspace) => TripWorkspace) => {
      setWorkspaces((prevList) =>
        prevList.map((w) =>
          w.id === (activeTrip?.id || activeId)
            ? { ...updater(w), updatedAt: new Date().toISOString() }
            : w
        )
      );
    },
    [activeTrip?.id, activeId]
  );

  const handleCreateNewTrip = () => {
    const fresh = createNewWorkspace();
    setWorkspaces((prev) => [fresh, ...prev]);
    setActiveId(fresh.id);
    setActiveTab('itinerary');
    setPlanBTarget(null);
    setPlanBResults([]);
    setPlanBNote(null);
    setErrorMsg(null);
  };

  const handleDeleteCurrentTrip = () => {
    if (workspaces.length <= 1) {
      const fresh = createNewWorkspace();
      setWorkspaces([fresh]);
      setActiveId(fresh.id);
      return;
    }
    const remaining = workspaces.filter((w) => w.id !== activeTrip.id);
    setWorkspaces(remaining);
    setActiveId(remaining[0].id);
  };

  const handleModeChange = (mode: WorkspaceMode) => {
    updateActiveTrip((t) => ({ ...t, mode }));
    if (mode === 'live') {
      setActiveTab('live');
    } else if (activeTab === 'live') {
      setActiveTab('itinerary');
    }
  };

  const handleToggleLocalFriend = () => {
    updateActiveTrip((t) => ({ ...t, localFriendMode: !t.localFriendMode }));
  };

  // Conversational Turn
  const handleSendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isChatLoading) return;
    setErrorMsg(null);

    const userMsg: ChatMessage = {
      id: `msg-u-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    };

    const snapshotTrip: TripWorkspace = {
      ...activeTrip,
      messages: [...activeTrip.messages, userMsg],
    };

    updateActiveTrip((t) => ({
      ...t,
      messages: [...t.messages, userMsg],
    }));

    setIsChatLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trip: snapshotTrip,
          userMessage: trimmed,
          model: selectedModel,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not reach TripBuddy AI.');
      }

      const turn = data as ChatTurnResponse;
      const assistantMsg: ChatMessage = {
        id: `msg-a-${Date.now()}`,
        role: 'assistant',
        content: turn.reply,
        timestamp: new Date().toISOString(),
        quickReplies: turn.quickReplies,
        sources: turn.sources,
        appliedUpdates: turn.appliedUpdates,
        modelUsed: turn.modelUsed,
        localFriendMode: activeTrip.localFriendMode,
      };

      updateActiveTrip((t) => {
        const patched = applyTripPatch(t, turn.tripPatch);
        return {
          ...patched,
          messages: [...patched.messages, assistantMsg],
        };
      });

      // Automatically fetch live weather once a destination is newly established
      if (turn.tripPatch?.destination && turn.tripPatch.destination !== activeTrip.destination) {
        fetch('/api/weather', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            destination: turn.tripPatch.destination,
            country: turn.tripPatch.country,
            lat: turn.tripPatch.lat,
            lon: turn.tripPatch.lon,
          }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((weather) => {
            if (weather?.currentTemp !== undefined) {
              updateActiveTrip((t) => ({ ...t, weather }));
            }
          })
          .catch(() => {});
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unexpected error during chat.');
    } finally {
      setIsChatLoading(false);
    }
  };

  // Pace & Energy Optimizer
  const handleUpdatePace = (paceProfile: PaceEnergyProfile) => {
    updateActiveTrip((t) => ({ ...t, paceProfile }));
  };

  const handleReoptimizeForPace = () => {
    const p = activeTrip.paceProfile;
    const wakeText =
      p.wakeWindow === 'early'
        ? 'early bird (7:00 AM starts)'
        : p.wakeWindow === 'late'
        ? 'late riser (nothing before 10:30 AM)'
        : 'balanced (9:00 AM starts)';
    handleSendMessage(
      `Re-optimize my current itinerary around my Travel Pace & Energy settings: ${wakeText}, ${p.pace} daily pace, ${p.walkingTolerance} walking tolerance, and ~${p.restBufferMinutes} min rest buffers. Keep the best stops and adjust times & density.`
    );
  };

  // Stop Mutations
  const handleToggleStopCompleted = (dayNum: number, stopId: string) => {
    updateActiveTrip((t) => ({
      ...t,
      days: t.days.map((d) =>
        d.day !== dayNum
          ? d
          : {
              ...d,
              stops: d.stops.map((s) =>
                s.id !== stopId
                  ? s
                  : { ...s, status: s.status === 'completed' ? 'planned' : 'completed' }
              ),
            }
      ),
    }));
  };

  const handleDeleteStop = (dayNum: number, stopId: string) => {
    updateActiveTrip((t) => ({
      ...t,
      days: t.days.map((d) =>
        d.day !== dayNum ? d : { ...d, stops: d.stops.filter((s) => s.id !== stopId) }
      ),
    }));
  };

  const handleRemoveCustomSection = (sectionId: string) => {
    updateActiveTrip((t) => ({
      ...t,
      customSections: t.customSections.filter((s) => s.id !== sectionId),
    }));
  };

  // Live Weather & Adaptation
  const handleFetchWeather = async (lat?: number, lon?: number, label?: string) => {
    setIsPanelBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/weather', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: label || activeTrip.destination,
          country: label ? undefined : activeTrip.country,
          lat,
          lon,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load weather.');
      updateActiveTrip((t) => ({ ...t, weather: data }));
    } catch (err: any) {
      setErrorMsg(err?.message || 'Weather lookup failed.');
    } finally {
      setIsPanelBusy(false);
    }
  };

  const handleAdaptWeather = async () => {
    setIsPanelBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/weather/adapt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trip: activeTrip, model: selectedModel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Weather adaptation failed.');

      const msg: ChatMessage = {
        id: `msg-wx-${Date.now()}`,
        role: 'assistant',
        timestamp: new Date().toISOString(),
        content: `**Weather-Adaptive Update:** ${data.summary}`,
        appliedUpdates: data.changes?.length ? data.changes : ['Rearranged itinerary for live weather forecast'],
        sources: data.sources,
        modelUsed: data.modelUsed,
      };

      updateActiveTrip((t) => ({
        ...t,
        weather: data.weather || t.weather,
        days: data.adaptedDays || t.days,
        messages: [...t.messages, msg],
      }));
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not adapt itinerary for weather.');
    } finally {
      setIsPanelBusy(false);
    }
  };

  // Live Companion Suggestions
  const handleGetLiveSuggestions = async (params: {
    locationLabel: string;
    lat?: number;
    lon?: number;
    remainingHours: number;
    mood: string;
  }) => {
    setIsPanelBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/live/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trip: activeTrip,
          ...params,
          model: selectedModel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Live suggestions failed.');

      const msg: ChatMessage = {
        id: `msg-live-${Date.now()}`,
        role: 'assistant',
        timestamp: new Date().toISOString(),
        content: data.summary,
        appliedUpdates: [`Found ${data.suggestions?.length || 0} right-now suggestions near ${params.locationLabel || activeTrip.destination}`],
        sources: data.sources,
        modelUsed: data.modelUsed,
      };

      updateActiveTrip((t) => ({
        ...t,
        weather: data.weather || t.weather,
        liveSuggestions: data.suggestions || [],
        messages: [...t.messages, msg],
      }));
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not fetch live suggestions.');
    } finally {
      setIsPanelBusy(false);
    }
  };

  const handleAddLiveSuggestionToDay = (suggestion: LiveSuggestion, dayNum: number) => {
    const newStop: ItineraryStop = {
      id: `stop-live-${Date.now()}`,
      day: dayNum,
      timeWindow: 'Right Now',
      title: suggestion.title,
      neighborhood: suggestion.neighborhood,
      description: `${suggestion.whyNow}${suggestion.localTip ? ` Tip: ${suggestion.localTip}` : ''}`,
      category: suggestion.category,
      indoorOutdoor: suggestion.indoorOutdoor,
      estimatedCost: suggestion.estimatedCost,
      lat: suggestion.lat,
      lon: suggestion.lon,
      status: 'planned',
    };

    updateActiveTrip((t) => {
      if (t.days.length === 0) {
        return {
          ...t,
          durationDays: Math.max(1, t.durationDays),
          days: [{ day: 1, title: 'Live Day Plan', stops: [newStop] }],
        };
      }
      return {
        ...t,
        days: t.days.map((d) =>
          d.day === dayNum ? { ...d, stops: [...d.stops, newStop] } : d
        ),
      };
    });
  };

  // Plan B Generator
  const handleRunPlanB = async (reason: string, stop?: ItineraryStop | null) => {
    setIsPanelBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/plan-b', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trip: activeTrip,
          cancelledStop: stop || undefined,
          reason,
          model: selectedModel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Plan B generation failed.');
      setPlanBResults(data.alternatives || []);
      setPlanBNote(data.note || null);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not generate Plan B alternatives.');
    } finally {
      setIsPanelBusy(false);
    }
  };

  const handleTriggerPlanBFromStop = (stop: ItineraryStop) => {
    setPlanBTarget(stop);
    setPlanBResults([]);
    setPlanBNote(null);
    setActiveTab('live');
    setMobilePane('cockpit');
    handleRunPlanB(`Need an immediate Plan B for "${stop.title}" (closed, crowded, or weather disrupted)`, stop);
  };

  const handleApplyPlanBSwap = (
    alt: PlanBAlternative,
    targetStop: ItineraryStop | null,
    dayNum: number
  ) => {
    const replacement: ItineraryStop = {
      id: `stop-planb-${Date.now()}`,
      day: targetStop?.day || dayNum,
      timeWindow: targetStop?.timeWindow || 'Flexible',
      title: alt.title,
      neighborhood: alt.neighborhood,
      description: `${alt.reason} (${alt.openStatus})`,
      category: alt.category,
      indoorOutdoor: alt.indoorOutdoor,
      estimatedCost: alt.estimatedCost,
      lat: alt.lat,
      lon: alt.lon,
      status: 'swapped',
    };

    updateActiveTrip((t) => {
      let nextDays = t.days;
      if (targetStop) {
        nextDays = t.days.map((d) =>
          d.day !== targetStop.day
            ? d
            : {
                ...d,
                stops: d.stops.map((s) => (s.id === targetStop.id ? replacement : s)),
              }
        );
      } else if (t.days.length === 0) {
        nextDays = [{ day: 1, title: 'Live Plan', stops: [replacement] }];
      } else {
        nextDays = t.days.map((d) =>
          d.day === dayNum ? { ...d, stops: [...d.stops, replacement] } : d
        );
      }

      const swapNote: ChatMessage = {
        id: `msg-pb-${Date.now()}`,
        role: 'assistant',
        timestamp: new Date().toISOString(),
        content: targetStop
          ? `Swapped **${targetStop.title}** out for Plan B: **${alt.title}** (${alt.neighborhood}).`
          : `Added Plan B option **${alt.title}** (${alt.neighborhood}) to Day ${dayNum}.`,
        appliedUpdates: [`Applied Plan B: ${alt.title}`],
      };

      return {
        ...t,
        days: nextDays,
        messages: [...t.messages, swapNote],
      };
    });

    setPlanBTarget(null);
    setPlanBResults([]);
    setPlanBNote(null);
    setActiveTab('itinerary');
  };

  // Budget & Reality Check
  const handleUpdateBudgetMeta = (updates: {
    targetBudget?: number;
    currency?: string;
    travelersCount?: number;
  }) => {
    updateActiveTrip((t) => ({
      ...t,
      targetBudget: updates.targetBudget !== undefined ? updates.targetBudget : t.targetBudget,
      currency: updates.currency ? updates.currency.toUpperCase() : t.currency,
      currencySymbol: updates.currency ? getCurrencySymbol(updates.currency) : t.currencySymbol,
      travelersCount:
        updates.travelersCount !== undefined ? updates.travelersCount : t.travelersCount,
    }));
  };

  const handleAddExpense = (expense: Omit<ExpenseEntry, 'id'>) => {
    const entry: ExpenseEntry = {
      ...expense,
      id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    };
    updateActiveTrip((t) => ({
      ...t,
      expenses: [entry, ...t.expenses],
    }));
  };

  const handleDeleteExpense = (id: string) => {
    updateActiveTrip((t) => ({
      ...t,
      expenses: t.expenses.filter((e) => e.id !== id),
    }));
  };

  const handleRunRealityCheck = async (overrideBudget?: number, overrideCurrency?: string) => {
    setIsPanelBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/budget/reality-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trip: activeTrip,
          overrideBudget,
          overrideCurrency,
          model: selectedModel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Cost reality check failed.');

      const msg: ChatMessage = {
        id: `msg-rc-${Date.now()}`,
        role: 'assistant',
        timestamp: new Date().toISOString(),
        content: `**Cost Reality Check (${data.result.verdict.toUpperCase()}):** ${data.result.headline}\n\n${data.result.summary}`,
        appliedUpdates: ['Updated AI Trip Cost Reality Check in Budget panel'],
        sources: data.result.sources,
        modelUsed: data.modelUsed,
      };

      updateActiveTrip((t) => ({
        ...t,
        realityCheck: data.result,
        messages: [...t.messages, msg],
      }));
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not complete cost reality check.');
    } finally {
      setIsPanelBusy(false);
    }
  };

  // Group Decision Maker
  const handleAddGroupMember = (member: Omit<GroupMember, 'id'>) => {
    const newMember: GroupMember = {
      ...member,
      id: `grp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    };
    updateActiveTrip((t) => {
      const nextMembers = [...t.groupMembers, newMember];
      return {
        ...t,
        groupMembers: nextMembers,
        travelersCount: Math.max(t.travelersCount, nextMembers.length),
      };
    });
  };

  const handleRemoveGroupMember = (id: string) => {
    updateActiveTrip((t) => ({
      ...t,
      groupMembers: t.groupMembers.filter((m) => m.id !== id),
    }));
  };

  const handleSynthesizeGroup = async () => {
    setIsPanelBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/group/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trip: activeTrip,
          members: activeTrip.groupMembers,
          model: selectedModel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Group synthesis failed.');

      const msg: ChatMessage = {
        id: `msg-grp-${Date.now()}`,
        role: 'assistant',
        timestamp: new Date().toISOString(),
        content: data.reply,
        appliedUpdates: [
          `Synthesized group consensus itinerary for ${activeTrip.groupMembers.length} travelers`,
        ],
        sources: data.sources,
        modelUsed: data.modelUsed,
      };

      updateActiveTrip((t) => ({
        ...t,
        days: data.days?.length ? data.days : t.days,
        budgetEstimate: data.budgetEstimate || t.budgetEstimate,
        groupConsensus: data.consensus,
        messages: [...t.messages, msg],
      }));
    } catch (err: any) {
      setErrorMsg(err?.message || 'Group synthesis failed.');
    } finally {
      setIsPanelBusy(false);
    }
  };

  // Discover: Surprise Me & Local Friend Hidden Gems
  const handleRunSurpriseMe = async (params: {
    origin: string;
    budget: number;
    currency: string;
    durationDays: number;
    personality: string;
    vibe: string;
  }) => {
    setIsPanelBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/discover/surprise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params, model: selectedModel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Surprise Me failed.');

      updateActiveTrip((t) => ({
        ...t,
        surprisePitches: data.pitches || [],
      }));
    } catch (err: any) {
      setErrorMsg(err?.message || 'Surprise Me discovery failed.');
    } finally {
      setIsPanelBusy(false);
    }
  };

  const handleLaunchSurpriseTrip = (pitch: SurprisePitch) => {
    updateActiveTrip((t) => ({
      ...t,
      title: `${pitch.destination} · ${pitch.durationDays}d`,
      destination: pitch.destination,
      country: pitch.country,
      lat: pitch.lat,
      lon: pitch.lon,
      durationDays: pitch.durationDays,
      targetBudget: pitch.estimatedTotal,
      currency: pitch.currency,
      currencySymbol: pitch.currencySymbol,
    }));
    setActiveTab('itinerary');
    handleSendMessage(
      `I love the Surprise Me pick: ${pitch.destination}, ${pitch.country} for ${pitch.durationDays} days around ${pitch.currencySymbol}${pitch.estimatedTotal} ${pitch.currency}. Before building the full itinerary, ask me 2 quick questions to dial in my pace and must-dos, or build Day 1–${pitch.durationDays} if you already have enough.`
    );
  };

  const handleRunLocalGems = async (destination: string, focus: string) => {
    setIsPanelBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/discover/gems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination,
          focus,
          currency: activeTrip.currency,
          model: selectedModel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Local gems lookup failed.');

      const msg: ChatMessage = {
        id: `msg-gems-${Date.now()}`,
        role: 'assistant',
        timestamp: new Date().toISOString(),
        content: data.localIntro,
        appliedUpdates: [`Pinned ${data.gems?.length || 0} local hidden gems in ${destination}`],
        sources: data.sources,
        modelUsed: data.modelUsed,
        localFriendMode: true,
      };

      updateActiveTrip((t) => ({
        ...t,
        destination: t.destination || destination,
        hiddenGems: data.gems || [],
        messages: [...t.messages, msg],
      }));
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not find local hidden gems.');
    } finally {
      setIsPanelBusy(false);
    }
  };

  const handleToggleGemPin = (gemId: string) => {
    updateActiveTrip((t) => ({
      ...t,
      hiddenGems: t.hiddenGems.map((g) =>
        g.id === gemId ? { ...g, pinnedOnMap: !g.pinnedOnMap } : g
      ),
    }));
  };

  const handleAddGemToDay = (gem: HiddenGemItem, dayNum: number) => {
    const stop: ItineraryStop = {
      id: `stop-gem-${Date.now()}`,
      day: dayNum,
      timeWindow: gem.bestTime || 'Afternoon',
      title: gem.title,
      neighborhood: gem.neighborhood,
      description: `${gem.whyLocalsLoveIt}${gem.insiderTip ? ` Local tip: ${gem.insiderTip}` : ''}`,
      category: 'hidden-gem',
      indoorOutdoor: 'mixed',
      estimatedCost: gem.estimatedCost,
      lat: gem.lat,
      lon: gem.lon,
      status: 'planned',
      isHiddenGem: true,
    };

    updateActiveTrip((t) => {
      if (t.days.length === 0) {
        return {
          ...t,
          durationDays: Math.max(1, t.durationDays),
          days: [{ day: 1, title: `${t.destination || 'Local'} Exploration`, stops: [stop] }],
        };
      }
      return {
        ...t,
        days: t.days.map((d) =>
          d.day === dayNum ? { ...d, stops: [...d.stops, stop] } : d
        ),
      };
    });
    setActiveTab('itinerary');
  };

  const navItems: { id: CockpitTab; label: string; icon: React.ReactNode }[] = [
    { id: 'itinerary', label: 'Itinerary & Map', icon: <MapIcon className="w-3.5 h-3.5" /> },
    { id: 'live', label: 'Live Companion', icon: <Navigation className="w-3.5 h-3.5" /> },
    { id: 'budget', label: 'Budget', icon: <Wallet className="w-3.5 h-3.5" /> },
    { id: 'group', label: 'Group', icon: <Users className="w-3.5 h-3.5" /> },
    { id: 'discover', label: 'Discover', icon: <Sparkles className="w-3.5 h-3.5" /> },
  ];

  // Unboxed typographic telemetry summary for active trip
  const tripSummaryLine = [
    activeTrip.destination
      ? [activeTrip.destination, activeTrip.country].filter(Boolean).join(', ')
      : 'No destination locked yet',
    activeTrip.durationDays ? `${activeTrip.durationDays} Days` : null,
    activeTrip.targetBudget
      ? formatMoney(activeTrip.targetBudget, activeTrip.currency, activeTrip.currencySymbol)
      : null,
    activeTrip.weather
      ? `${activeTrip.weather.currentTemp}°C ${activeTrip.weather.currentCondition}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <div className="no-print h-screen w-screen overflow-hidden flex flex-col bg-[#0B1120] text-slate-100">
        {/* Strict 3-Zone Top Bar */}
        <header className="h-14 px-4 lg:px-6 border-b border-[#24324A] bg-[#0B1120] flex items-center justify-between gap-6 shrink-0">
          {/* Zone 1: Brand + Saved Trip Switcher */}
          <div className="flex items-center gap-3 min-w-0 shrink-0">
            <div className="flex items-center gap-2 whitespace-nowrap">
              <Compass className="w-5 h-5 text-cyan-400 shrink-0" />
              <span className="text-sm font-bold tracking-tight text-slate-50">TripBuddy</span>
            </div>

            <span className="text-slate-600 hidden sm:inline">/</span>

            <div className="hidden sm:flex items-center gap-1">
              <select
                value={activeTrip.id}
                onChange={(e) => setActiveId(e.target.value)}
                aria-label="Select saved trip"
                className="max-w-[190px] bg-transparent hover:bg-[#131C2E] border border-transparent hover:border-[#24324A] rounded-md px-2 py-1 text-xs font-medium text-slate-200 focus:outline-none truncate cursor-pointer"
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id} className="bg-[#0F172A] text-slate-100">
                    {w.title}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleDeleteCurrentTrip}
                className="p-1 text-slate-500 hover:text-red-400 transition cursor-pointer"
                title="Delete or reset active trip"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Zone 2: Single-line Center View Links */}
          <nav className="hidden md:flex items-center gap-1 lg:gap-2 overflow-x-auto">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobilePane('cockpit');
                  }}
                  className={`px-3 py-1.5 text-xs font-medium whitespace-nowrap transition flex items-center gap-1.5 border-b-2 cursor-pointer ${
                    isActive
                      ? 'border-cyan-400 text-cyan-300'
                      : 'border-transparent text-slate-400 hover:text-slate-100'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single Primary CTA */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={handleCreateNewTrip}
              className="px-3.5 py-1.5 rounded-md bg-cyan-500 hover:bg-cyan-400 text-[#0B1120] font-semibold text-xs whitespace-nowrap transition flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Trip</span>
            </button>
          </div>
        </header>

        {/* Workspace Mode & Control Strip */}
        <div className="px-4 lg:px-6 py-2 border-b border-[#24324A] bg-[#0F172A] flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Planning vs Live Trip Mode Segmented Switch */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="inline-flex border border-[#24324A] rounded-md overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => handleModeChange('planning')}
                className={`px-3 py-1 font-medium transition whitespace-nowrap cursor-pointer ${
                  activeTrip.mode === 'planning'
                    ? 'bg-cyan-500/20 text-cyan-200'
                    : 'bg-[#0B1120] text-slate-400 hover:text-slate-200'
                }`}
              >
                Planning Mode
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('live')}
                className={`px-3 py-1 border-l border-[#24324A] font-medium transition whitespace-nowrap cursor-pointer ${
                  activeTrip.mode === 'live'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-[#0B1120] text-slate-400 hover:text-slate-200'
                }`}
              >
                Live Trip Mode
              </button>
            </div>

            <span className="text-xs text-slate-400 font-mono tabular-nums hidden xl:inline truncate max-w-[420px]">
              {tripSummaryLine}
            </span>
          </div>

          {/* Right Controls: AI Local Friend, Model Selector, Export PDF */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleToggleLocalFriend}
              className={`px-2.5 py-1 rounded-md border text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeTrip.localFriendMode
                  ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
                  : 'border-[#24324A] bg-[#0B1120] text-slate-400 hover:text-slate-200'
              }`}
              title="Switch AI tone & search into Local Resident mode"
            >
              <Coffee className="w-3.5 h-3.5" />
              <span>Local Friend: {activeTrip.localFriendMode ? 'On' : 'Off'}</span>
            </button>

            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value as AIProviderId)}
              aria-label="Select AI Model"
              className="px-2.5 py-1 rounded-md border border-[#24324A] bg-[#0B1120] text-xs text-slate-200 font-mono focus:border-cyan-500/60 focus:outline-none cursor-pointer"
            >
              {availableModels.map((m) => (
                <option key={m.id} value={m.id} className="bg-[#0F172A]">
                  {m.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => window.print()}
              className="px-2.5 py-1 rounded-md border border-[#24324A] bg-[#0B1120] hover:border-slate-500 text-xs text-slate-300 hover:text-white transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              title="Export trip plan as PDF"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export PDF</span>
            </button>
          </div>
        </div>

        {/* Mobile Tab Switcher */}
        <div className="md:hidden px-3 py-2 border-b border-[#24324A] bg-[#0B1120] flex items-center justify-between gap-2 shrink-0">
          <div className="inline-flex border border-[#24324A] rounded-md overflow-hidden text-xs">
            <button
              type="button"
              onClick={() => setMobilePane('chat')}
              className={`px-3 py-1 font-medium ${
                mobilePane === 'chat' ? 'bg-cyan-500/20 text-cyan-200' : 'text-slate-400'
              }`}
            >
              AI Chat
            </button>
            <button
              type="button"
              onClick={() => setMobilePane('cockpit')}
              className={`px-3 py-1 border-l border-[#24324A] font-medium ${
                mobilePane === 'cockpit' ? 'bg-cyan-500/20 text-cyan-200' : 'text-slate-400'
              }`}
            >
              Cockpit
            </button>
          </div>

          <select
            value={activeTab}
            onChange={(e) => {
              setActiveTab(e.target.value as CockpitTab);
              setMobilePane('cockpit');
            }}
            className="px-2.5 py-1 rounded-md bg-[#131C2E] border border-[#24324A] text-xs text-slate-200"
          >
            {navItems.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>
        </div>

        {/* Split-View Main Workspace */}
        <main className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-12 overflow-hidden">
          {/* Left Pane: Conversational AI Co-Pilot */}
          <div
            className={`md:col-span-5 h-full min-h-0 ${
              mobilePane === 'chat' ? 'block' : 'hidden md:block'
            }`}
          >
            <ChatPane
              messages={activeTrip.messages}
              mode={activeTrip.mode}
              localFriendMode={activeTrip.localFriendMode}
              isLoading={isChatLoading}
              error={errorMsg}
              onSendMessage={handleSendMessage}
              onDismissError={() => setErrorMsg(null)}
            />
          </div>

          {/* Right Pane: Interactive Travel Cockpit */}
          <section
            className={`md:col-span-7 h-full min-h-0 overflow-y-auto bg-[#0B1120] p-4 lg:p-5 ${
              mobilePane === 'cockpit' ? 'block' : 'hidden md:block'
            }`}
          >
            <div className="max-w-4xl mx-auto">
              {activeTab === 'itinerary' && (
                <ItineraryMapPanel
                  trip={activeTrip}
                  isBusy={isChatLoading || isPanelBusy}
                  onUpdatePace={handleUpdatePace}
                  onReoptimizeForPace={handleReoptimizeForPace}
                  onToggleStopCompleted={handleToggleStopCompleted}
                  onDeleteStop={handleDeleteStop}
                  onTriggerPlanB={handleTriggerPlanBFromStop}
                  onRemoveCustomSection={handleRemoveCustomSection}
                  onAskStarter={(prompt) => {
                    setMobilePane('chat');
                    handleSendMessage(prompt);
                  }}
                />
              )}

              {activeTab === 'live' && (
                <LiveCompanionPanel
                  trip={activeTrip}
                  isBusy={isChatLoading || isPanelBusy}
                  planBTarget={planBTarget}
                  planBResults={planBResults}
                  planBNote={planBNote}
                  onClearPlanBTarget={() => setPlanBTarget(null)}
                  onFetchWeather={handleFetchWeather}
                  onAdaptWeather={handleAdaptWeather}
                  onGetLiveSuggestions={handleGetLiveSuggestions}
                  onAddLiveSuggestionToDay={handleAddLiveSuggestionToDay}
                  onRunPlanB={handleRunPlanB}
                  onApplyPlanBSwap={handleApplyPlanBSwap}
                  onUpdateLiveLocation={(liveLocation) =>
                    updateActiveTrip((t) => ({ ...t, liveLocation }))
                  }
                />
              )}

              {activeTab === 'budget' && (
                <BudgetRealityPanel
                  trip={activeTrip}
                  isBusy={isChatLoading || isPanelBusy}
                  onUpdateBudgetMeta={handleUpdateBudgetMeta}
                  onAddExpense={handleAddExpense}
                  onDeleteExpense={handleDeleteExpense}
                  onRunRealityCheck={handleRunRealityCheck}
                  onApplySavingSwap={(prompt) => {
                    setMobilePane('chat');
                    handleSendMessage(prompt);
                  }}
                />
              )}

              {activeTab === 'group' && (
                <GroupDecisionPanel
                  trip={activeTrip}
                  isBusy={isChatLoading || isPanelBusy}
                  onAddMember={handleAddGroupMember}
                  onRemoveMember={handleRemoveGroupMember}
                  onSynthesizeGroup={handleSynthesizeGroup}
                />
              )}

              {activeTab === 'discover' && (
                <DiscoverPanel
                  trip={activeTrip}
                  isBusy={isChatLoading || isPanelBusy}
                  onRunSurpriseMe={handleRunSurpriseMe}
                  onLaunchSurpriseTrip={handleLaunchSurpriseTrip}
                  onRunLocalGems={handleRunLocalGems}
                  onToggleGemPin={handleToggleGemPin}
                  onAddGemToDay={handleAddGemToDay}
                />
              )}
            </div>
          </section>
        </main>
      </div>

      {/* Print-only PDF Dossier */}
      <PrintableTripView trip={activeTrip} />
    </>
  );
}
