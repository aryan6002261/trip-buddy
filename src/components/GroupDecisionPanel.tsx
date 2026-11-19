import React, { useState, useMemo } from 'react';
import {
  Users,
  Plus,
  Trash2,
  Sparkles,
  Loader2,
  CheckCircle2,
  Ban,
} from 'lucide-react';
import { GroupMember, TripWorkspace } from '../types';
import { formatMoney } from '../lib/storage';

interface GroupDecisionPanelProps {
  trip: TripWorkspace;
  isBusy: boolean;
  onAddMember: (member: Omit<GroupMember, 'id'>) => void;
  onRemoveMember: (id: string) => void;
  onSynthesizeGroup: () => Promise<void>;
}

export const GroupDecisionPanel: React.FC<GroupDecisionPanelProps> = ({
  trip,
  isBusy,
  onAddMember,
  onRemoveMember,
  onSynthesizeGroup,
}) => {
  const [name, setName] = useState('');
  const [maxBudget, setMaxBudget] = useState(
    trip.targetBudget ? String(Math.round(trip.targetBudget / Math.max(1, trip.travelersCount))) : '1500'
  );
  const [pace, setPace] = useState<'relaxed' | 'moderate' | 'packed'>('moderate');
  const [interests, setInterests] = useState('');
  const [mustHaves, setMustHaves] = useState('');
  const [vetoes, setVetoes] = useState('');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const splitCsv = (val: string) =>
      val
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

    onAddMember({
      name: name.trim(),
      maxBudget: Number(maxBudget) || 0,
      pace,
      interests: splitCsv(interests),
      mustHaves: splitCsv(mustHaves),
      vetoes: splitCsv(vetoes),
    });

    setName('');
    setInterests('');
    setMustHaves('');
    setVetoes('');
  };

  const alignment = useMemo(() => {
    const members = trip.groupMembers;
    if (members.length === 0) return null;
    const validBudgets = members.map((m) => m.maxBudget).filter((b) => b > 0);
    const minCeiling = validBudgets.length > 0 ? Math.min(...validBudgets) : 0;
    const avgBudget =
      validBudgets.length > 0
        ? Math.round(validBudgets.reduce((a, b) => a + b, 0) / validBudgets.length)
        : 0;

    const interestFreq = new Map<string, number>();
    for (const m of members) {
      for (const item of m.interests) {
        const key = item.toLowerCase();
        interestFreq.set(key, (interestFreq.get(key) || 0) + 1);
      }
    }
    const overlapping = Array.from(interestFreq.entries())
      .filter(([, count]) => count >= 2)
      .map(([k]) => k);

    const allVetoes = Array.from(new Set(members.flatMap((m) => m.vetoes)));
    return { minCeiling, avgBudget, overlapping, allVetoes };
  }, [trip.groupMembers]);

  const consensus = trip.groupConsensus;

  return (
    <div className="space-y-5">
      <div className="rounded-lg bg-[#131C2E] border border-[#24324A] p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Users className="w-4 h-4 text-cyan-400" />
              <span>Group Travel Decision Maker</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Combine every traveler’s budget cap, pace, must-haves, and vetoes into one consensus plan everyone agrees on.
            </p>
          </div>

          <button
            type="button"
            disabled={isBusy || trip.groupMembers.length < 2}
            onClick={onSynthesizeGroup}
            className="px-3.5 py-2 rounded-md bg-cyan-500 hover:bg-cyan-400 disabled:bg-[#192438] disabled:text-slate-500 text-[#0B1120] font-semibold text-xs transition flex items-center gap-1.5 cursor-pointer"
          >
            {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            <span>Synthesize Consensus Itinerary</span>
          </button>
        </div>

        {/* Add Traveler Form */}
        <form onSubmit={handleAdd} className="p-3.5 rounded-md bg-[#0F172A] border border-[#24324A] space-y-3">
          <div className="text-xs font-medium text-slate-200">Add Traveler Profile</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Traveler Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Maya"
                className="w-full px-3 py-1.5 rounded-md bg-[#131C2E] border border-[#24324A] focus:border-cyan-500/60 focus:outline-none text-xs text-slate-100 placeholder:text-slate-500"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Max Budget ({trip.currency})
              </label>
              <input
                type="number"
                min={0}
                value={maxBudget}
                onChange={(e) => setMaxBudget(e.target.value)}
                placeholder="1500"
                className="w-full px-3 py-1.5 rounded-md bg-[#131C2E] border border-[#24324A] focus:border-cyan-500/60 focus:outline-none text-xs font-mono tabular-nums text-slate-100"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Preferred Pace</label>
              <select
                value={pace}
                onChange={(e) => setPace(e.target.value as 'relaxed' | 'moderate' | 'packed')}
                className="w-full px-2.5 py-1.5 rounded-md bg-[#131C2E] border border-[#24324A] text-xs text-slate-200"
              >
                <option value="relaxed">Relaxed</option>
                <option value="moderate">Moderate</option>
                <option value="packed">Packed</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Interests (comma-separated)</label>
              <input
                type="text"
                value={interests}
                onChange={(e) => setInterests(e.target.value)}
                placeholder="street food, architecture, cafés"
                className="w-full px-3 py-1.5 rounded-md bg-[#131C2E] border border-[#24324A] focus:border-cyan-500/60 focus:outline-none text-xs text-slate-100 placeholder:text-slate-500"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Must-Haves</label>
              <input
                type="text"
                value={mustHaves}
                onChange={(e) => setMustHaves(e.target.value)}
                placeholder="sunset boat, local market"
                className="w-full px-3 py-1.5 rounded-md bg-[#131C2E] border border-[#24324A] focus:border-cyan-500/60 focus:outline-none text-xs text-slate-100 placeholder:text-slate-500"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Strict Vetoes / Dislikes</label>
              <input
                type="text"
                value={vetoes}
                onChange={(e) => setVetoes(e.target.value)}
                placeholder="no 6am alarms, no nightclubs"
                className="w-full px-3 py-1.5 rounded-md bg-[#131C2E] border border-[#24324A] focus:border-cyan-500/60 focus:outline-none text-xs text-slate-100 placeholder:text-slate-500"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-3.5 py-1.5 rounded-md bg-[#192438] hover:bg-cyan-500 hover:text-[#0B1120] border border-[#24324A] text-xs font-semibold text-slate-100 transition flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add to Group</span>
            </button>
          </div>
        </form>

        {/* Live Alignment Summary */}
        {alignment && (
          <div className="grid grid-cols-1 sm:grid-cols-3 border border-[#24324A] rounded-md bg-[#0F172A] divide-y sm:divide-y-0 sm:divide-x divide-[#24324A] text-xs">
            <div className="p-3">
              <div className="text-[11px] text-slate-400">Shared Budget Ceiling</div>
              <div className="text-base font-bold font-mono tabular-nums text-cyan-300 mt-0.5">
                {formatMoney(alignment.minCeiling, trip.currency, trip.currencySymbol)}
                <span className="text-[11px] font-normal text-slate-500"> / person</span>
              </div>
              <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                Group avg: {formatMoney(alignment.avgBudget, trip.currency, trip.currencySymbol)}
              </div>
            </div>

            <div className="p-3">
              <div className="text-[11px] text-slate-400">Overlapping Interests</div>
              <div className="text-xs text-slate-200 mt-1">
                {alignment.overlapping.length > 0
                  ? alignment.overlapping.join(' · ')
                  : 'Add shared tags across 2+ travelers'}
              </div>
            </div>

            <div className="p-3">
              <div className="text-[11px] text-slate-400 flex items-center gap-1">
                <Ban className="w-3 h-3 text-red-400" />
                <span>Active Group Vetoes</span>
              </div>
              <div className="text-xs text-red-300/90 mt-1">
                {alignment.allVetoes.length > 0 ? alignment.allVetoes.join(' · ') : 'None listed'}
              </div>
            </div>
          </div>
        )}

        {/* Group Roster List */}
        {trip.groupMembers.length === 0 ? (
          <div className="p-5 rounded-md bg-[#0F172A] border border-[#24324A] text-center text-xs text-slate-400">
            Add at least 2 travelers above with their budgets and preferences to unlock AI consensus planning.
          </div>
        ) : (
          <div className="divide-y divide-[#1E2B42] border border-[#24324A] rounded-md bg-[#0F172A]">
            {trip.groupMembers.map((member) => (
              <div key={member.id} className="p-3 flex items-start justify-between gap-3 text-xs">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-semibold text-slate-100">{member.name}</span>
                    <span className="font-mono tabular-nums text-cyan-300">
                      max {formatMoney(member.maxBudget, trip.currency, trip.currencySymbol)}
                    </span>
                    <span className="text-slate-500 capitalize">· {member.pace} pace</span>
                  </div>
                  {member.interests.length > 0 && (
                    <div className="text-slate-300">
                      <span className="text-slate-500">Interests: </span>
                      {member.interests.join(', ')}
                    </div>
                  )}
                  {member.mustHaves.length > 0 && (
                    <div className="text-emerald-300/90">
                      <span className="text-slate-500">Must-haves: </span>
                      {member.mustHaves.join(', ')}
                    </div>
                  )}
                  {member.vetoes.length > 0 && (
                    <div className="text-red-300/90">
                      <span className="text-slate-500">Vetoes: </span>
                      {member.vetoes.join(', ')}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => onRemoveMember(member.id)}
                  className="p-1.5 text-slate-500 hover:text-red-400 transition cursor-pointer shrink-0"
                  title="Remove member"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Consensus Report */}
      {consensus && (
        <div className="rounded-lg bg-[#131C2E] border border-[#24324A] p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Latest Group Consensus Report</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">{consensus.summary}</p>

          {consensus.tradeoffsResolved.length > 0 && (
            <div className="space-y-1">
              <div className="text-[11px] font-semibold text-slate-400">How Conflicts Were Solved</div>
              <ul className="list-disc pl-4 text-xs text-slate-300 space-y-1">
                {consensus.tradeoffsResolved.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          )}

          {consensus.memberNotes.length > 0 && (
            <div className="divide-y divide-[#1E2B42] border border-[#24324A] rounded-md bg-[#0F172A]">
              {consensus.memberNotes.map((mn, i) => (
                <div key={i} className="px-3 py-2 text-xs">
                  <span className="font-semibold text-cyan-300">{mn.name}: </span>
                  <span className="text-slate-300">{mn.satisfiedBy}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
