import React, { useState, useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import {
  Wallet,
  Plus,
  Trash2,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import {
  ExpenseCategory,
  ExpenseEntry,
  TripWorkspace,
} from '../types';
import { CURRENCY_MAP, formatMoney, getCurrencySymbol } from '../lib/storage';

interface BudgetRealityPanelProps {
  trip: TripWorkspace;
  isBusy: boolean;
  onUpdateBudgetMeta: (updates: {
    targetBudget?: number;
    currency?: string;
    travelersCount?: number;
  }) => void;
  onAddExpense: (expense: Omit<ExpenseEntry, 'id'>) => void;
  onDeleteExpense: (id: string) => void;
  onRunRealityCheck: (overrideBudget?: number, overrideCurrency?: string) => Promise<void>;
  onApplySavingSwap: (actionPrompt: string) => void;
}

const CATEGORY_META: { key: ExpenseCategory; label: string; color: string }[] = [
  { key: 'flights', label: 'Flights & Transit', color: '#22D3EE' },
  { key: 'stay', label: 'Accommodation', color: '#38BDF8' },
  { key: 'food', label: 'Food & Cafés', color: '#F59E0B' },
  { key: 'activities', label: 'Activities', color: '#10B981' },
  { key: 'misc', label: 'Misc & Local', color: '#94A3B8' },
];

export const BudgetRealityPanel: React.FC<BudgetRealityPanelProps> = ({
  trip,
  isBusy,
  onUpdateBudgetMeta,
  onAddExpense,
  onDeleteExpense,
  onRunRealityCheck,
  onApplySavingSwap,
}) => {
  const [chartMode, setChartMode] = useState<'planned' | 'actual'>('planned');
  const [amountInput, setAmountInput] = useState('');
  const [categoryInput, setCategoryInput] = useState<ExpenseCategory>('food');
  const [descInput, setDescInput] = useState('');
  const [paidByInput, setPaidByInput] = useState('Me');
  const [categoryFilter, setCategoryFilter] = useState<ExpenseCategory | 'all'>('all');

  const plannedTotal = useMemo(() => {
    const b = trip.budgetEstimate;
    return (b.flights || 0) + (b.stay || 0) + (b.food || 0) + (b.activities || 0) + (b.misc || 0);
  }, [trip.budgetEstimate]);

  const actualByCategory = useMemo(() => {
    const map: Record<ExpenseCategory, number> = {
      flights: 0,
      stay: 0,
      food: 0,
      activities: 0,
      misc: 0,
    };
    for (const exp of trip.expenses) {
      map[exp.category] = (map[exp.category] || 0) + (Number(exp.amount) || 0);
    }
    return map;
  }, [trip.expenses]);

  const actualTotal = useMemo(
    () => trip.expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
    [trip.expenses]
  );

  const travelers = Math.max(1, trip.travelersCount || trip.groupMembers.length || 1);
  const referenceBudget = trip.targetBudget > 0 ? trip.targetBudget : plannedTotal;
  const remaining = referenceBudget - actualTotal;
  const perPersonSpent = actualTotal / travelers;
  const perPersonTarget = referenceBudget / travelers;

  const chartData = useMemo(() => {
    const source = chartMode === 'planned' ? trip.budgetEstimate : actualByCategory;
    return CATEGORY_META.map((c) => ({
      name: c.label,
      value: Math.max(0, Number(source[c.key]) || 0),
      color: c.color,
    })).filter((item) => item.value > 0);
  }, [chartMode, trip.budgetEstimate, actualByCategory]);

  const filteredExpenses = useMemo(() => {
    if (categoryFilter === 'all') return trip.expenses;
    return trip.expenses.filter((e) => e.category === categoryFilter);
  }, [trip.expenses, categoryFilter]);

  const handleLogExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const numeric = parseFloat(amountInput);
    if (!Number.isFinite(numeric) || numeric <= 0 || !descInput.trim()) return;
    onAddExpense({
      amount: numeric,
      category: categoryInput,
      description: descInput.trim(),
      paidBy: paidByInput.trim() || 'Me',
      date: new Date().toISOString().slice(0, 10),
      splitAmong: travelers,
    });
    setAmountInput('');
    setDescInput('');
  };

  const rc = trip.realityCheck;

  return (
    <div className="space-y-5">
      {/* Top Budget Controls & KPI Grid */}
      <div className="rounded-lg bg-[#131C2E] border border-[#24324A] p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-cyan-400" />
              <span>Real-Time Budget Tracker</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Track actual spending on the road, monitor remaining balance, and compute per-person splits automatically.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              value={trip.currency}
              onChange={(e) => onUpdateBudgetMeta({ currency: e.target.value })}
              className="px-2 py-1.5 rounded-md bg-[#0F172A] border border-[#24324A] text-slate-200 font-mono"
              aria-label="Trip currency"
            >
              {Object.keys(CURRENCY_MAP).map((code) => (
                <option key={code} value={code}>
                  {code} ({getCurrencySymbol(code).trim()})
                </option>
              ))}
            </select>

            <div className="flex items-center bg-[#0F172A] border border-[#24324A] rounded-md px-2 py-1">
              <span className="text-[11px] text-slate-400 mr-1.5">Budget</span>
              <input
                type="number"
                min={0}
                value={trip.targetBudget || ''}
                onChange={(e) => onUpdateBudgetMeta({ targetBudget: Number(e.target.value) || 0 })}
                placeholder="2000"
                className="w-20 bg-transparent text-xs font-mono tabular-nums text-slate-100 focus:outline-none text-right"
              />
            </div>

            <div className="flex items-center bg-[#0F172A] border border-[#24324A] rounded-md px-2 py-1">
              <span className="text-[11px] text-slate-400 mr-1.5">Travelers</span>
              <input
                type="number"
                min={1}
                max={20}
                value={travelers}
                onChange={(e) =>
                  onUpdateBudgetMeta({ travelersCount: Math.max(1, Number(e.target.value) || 1) })
                }
                className="w-10 bg-transparent text-xs font-mono tabular-nums text-slate-100 focus:outline-none text-right"
              />
            </div>
          </div>
        </div>

        {/* Tabular KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 border border-[#24324A] rounded-md bg-[#0F172A] divide-y lg:divide-y-0 lg:divide-x divide-[#24324A]">
          <div className="p-3">
            <div className="text-[11px] text-slate-400">Target Budget</div>
            <div className="text-lg font-bold font-mono tabular-nums text-slate-100 mt-1">
              {formatMoney(referenceBudget, trip.currency, trip.currencySymbol)}
            </div>
            <div className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
              {formatMoney(perPersonTarget, trip.currency, trip.currencySymbol)} / person
            </div>
          </div>

          <div className="p-3">
            <div className="text-[11px] text-slate-400">Planned Estimate</div>
            <div className="text-lg font-bold font-mono tabular-nums text-cyan-300 mt-1">
              {formatMoney(plannedTotal, trip.currency, trip.currencySymbol)}
            </div>
            <div className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
              {plannedTotal > 0 ? 'From active itinerary' : 'Build plan to estimate'}
            </div>
          </div>

          <div className="p-3">
            <div className="text-[11px] text-slate-400">Actual Spent</div>
            <div className="text-lg font-bold font-mono tabular-nums text-slate-100 mt-1">
              {formatMoney(actualTotal, trip.currency, trip.currencySymbol)}
            </div>
            <div className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
              {formatMoney(perPersonSpent, trip.currency, trip.currencySymbol)} / person
            </div>
          </div>

          <div className="p-3">
            <div className="text-[11px] text-slate-400">Remaining Balance</div>
            <div
              className={`text-lg font-bold font-mono tabular-nums mt-1 ${
                remaining < 0
                  ? 'text-red-400'
                  : referenceBudget > 0 && remaining < referenceBudget * 0.15
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }`}
            >
              {formatMoney(remaining, trip.currency, trip.currencySymbol)}
            </div>
            <div className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
              {referenceBudget > 0
                ? `${Math.min(999, Math.round((actualTotal / referenceBudget) * 100))}% used`
                : 'Set a budget above'}
            </div>
          </div>
        </div>

        {/* Recharts Donut Chart + Category Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 pt-1">
          <div className="md:col-span-5 bg-[#0F172A] border border-[#24324A] rounded-md p-3 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-200">Expense Breakdown</span>
              <div className="flex border border-[#24324A] rounded overflow-hidden text-[11px]">
                <button
                  type="button"
                  onClick={() => setChartMode('planned')}
                  className={`px-2 py-0.5 transition cursor-pointer ${
                    chartMode === 'planned'
                      ? 'bg-cyan-500/20 text-cyan-300 font-medium'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Planned
                </button>
                <button
                  type="button"
                  onClick={() => setChartMode('actual')}
                  className={`px-2 py-0.5 border-l border-[#24324A] transition cursor-pointer ${
                    chartMode === 'actual'
                      ? 'bg-cyan-500/20 text-cyan-300 font-medium'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Actual
                </button>
              </div>
            </div>

            {chartData.length === 0 ? (
              <div className="h-44 flex items-center justify-center text-xs text-slate-500 text-center px-4">
                {chartMode === 'planned'
                  ? 'Plan a trip in chat to see estimated expense slices.'
                  : 'Log your first expense below to track actual spend.'}
              </div>
            ) : (
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={72}
                      paddingAngle={2}
                      stroke="#0F172A"
                      strokeWidth={2}
                    >
                      {chartData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val: any) =>
                        formatMoney(Number(val) || 0, trip.currency, trip.currencySymbol)
                      }
                      contentStyle={{
                        backgroundColor: '#131C2E',
                        borderColor: '#24324A',
                        borderRadius: '6px',
                        fontSize: '12px',
                        color: '#F1F5F9',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Category Comparison Table */}
          <div className="md:col-span-7 bg-[#0F172A] border border-[#24324A] rounded-md overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-[#131C2E] text-slate-400 border-b border-[#24324A]">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Category</th>
                  <th className="text-right px-3 py-2 font-medium">Planned</th>
                  <th className="text-right px-3 py-2 font-medium">Actual</th>
                  <th className="text-right px-3 py-2 font-medium">Delta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2B42]">
                {CATEGORY_META.map((cat) => {
                  const planned = Number(trip.budgetEstimate[cat.key]) || 0;
                  const actual = Number(actualByCategory[cat.key]) || 0;
                  const delta = planned - actual;
                  return (
                    <tr key={cat.key} className="hover:bg-[#192438]/40">
                      <td className="px-3 py-2.5 text-slate-200 flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-xs shrink-0"
                          style={{ backgroundColor: cat.color }}
                        />
                        <span>{cat.label}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-300">
                        {formatMoney(planned, trip.currency, trip.currencySymbol)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-100">
                        {formatMoney(actual, trip.currency, trip.currencySymbol)}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right font-mono tabular-nums ${
                          planned > 0 && delta < 0 ? 'text-red-400' : 'text-slate-400'
                        }`}
                      >
                        {planned > 0
                          ? formatMoney(delta, trip.currency, trip.currencySymbol)
                          : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Log Real Expense Form */}
        <form
          onSubmit={handleLogExpense}
          className="pt-3 border-t border-[#24324A] grid grid-cols-1 sm:grid-cols-12 gap-2"
        >
          <input
            type="text"
            value={descInput}
            onChange={(e) => setDescInput(e.target.value)}
            placeholder="Expense description (e.g. Train pass, Ramen lunch)"
            className="sm:col-span-4 px-3 py-2 rounded-md bg-[#0F172A] border border-[#24324A] focus:border-cyan-500/60 focus:outline-none text-xs text-slate-100 placeholder:text-slate-500"
          />
          <select
            value={categoryInput}
            onChange={(e) => setCategoryInput(e.target.value as ExpenseCategory)}
            className="sm:col-span-2 px-2.5 py-2 rounded-md bg-[#0F172A] border border-[#24324A] text-xs text-slate-200"
          >
            {CATEGORY_META.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            min="0"
            step="0.01"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder={`Amount (${trip.currencySymbol.trim()})`}
            className="sm:col-span-2 px-3 py-2 rounded-md bg-[#0F172A] border border-[#24324A] focus:border-cyan-500/60 focus:outline-none text-xs font-mono tabular-nums text-slate-100 placeholder:text-slate-500"
          />
          <input
            type="text"
            value={paidByInput}
            onChange={(e) => setPaidByInput(e.target.value)}
            placeholder="Paid by"
            className="sm:col-span-2 px-3 py-2 rounded-md bg-[#0F172A] border border-[#24324A] focus:border-cyan-500/60 focus:outline-none text-xs text-slate-100 placeholder:text-slate-500"
          />
          <button
            type="submit"
            disabled={!amountInput || !descInput.trim()}
            className="sm:col-span-2 px-3 py-2 rounded-md bg-cyan-500 hover:bg-cyan-400 disabled:bg-[#192438] disabled:text-slate-500 text-[#0B1120] font-semibold text-xs transition flex items-center justify-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Log</span>
          </button>
        </form>

        {/* Expense Ledger */}
        {trip.expenses.length > 0 && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-medium text-slate-300">
                Logged Expenses ({filteredExpenses.length})
              </span>
              <div className="flex items-center gap-1 text-[11px]">
                {(['all', ...CATEGORY_META.map((c) => c.key)] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-2 py-0.5 rounded border transition capitalize cursor-pointer ${
                      categoryFilter === cat
                        ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-200'
                        : 'border-[#24324A] bg-[#0F172A] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="border border-[#24324A] rounded-md bg-[#0F172A] divide-y divide-[#1E2B42]">
              {filteredExpenses.map((exp) => (
                <div
                  key={exp.id}
                  className="px-3 py-2 flex items-center justify-between gap-3 text-xs hover:bg-[#192438]/40"
                >
                  <div className="min-w-0">
                    <div className="text-slate-100 font-medium truncate">{exp.description}</div>
                    <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                      {exp.date} · {exp.category} · Paid by {exp.paidBy}
                      {exp.splitAmong > 1
                        ? ` · ${formatMoney(exp.amount / exp.splitAmong, trip.currency, trip.currencySymbol)}/ea`
                        : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono font-semibold tabular-nums text-slate-100">
                      {formatMoney(exp.amount, trip.currency, trip.currencySymbol)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onDeleteExpense(exp.id)}
                      className="text-slate-500 hover:text-red-400 transition cursor-pointer"
                      title="Delete expense"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* AI Trip Cost Reality Check */}
      <div className="rounded-lg bg-[#131C2E] border border-[#24324A] p-4 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-cyan-400" />
              <span>AI Trip Cost Reality Check</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Cross-checks your budget against live web pricing for flights, hotels, food, and transit—exposing hidden shortfalls honestly.
            </p>
          </div>
          <button
            type="button"
            disabled={isBusy || !trip.destination}
            onClick={() => onRunRealityCheck(trip.targetBudget || plannedTotal, trip.currency)}
            className="px-3.5 py-2 rounded-md bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-[#0B1120] font-semibold text-xs transition flex items-center gap-1.5 cursor-pointer"
          >
            {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldAlert className="w-3.5 h-3.5" />}
            <span>Run Live Cost Audit</span>
          </button>
        </div>

        {!rc ? (
          <div className="p-4 rounded-md bg-[#0F172A] border border-[#24324A] text-xs text-slate-400">
            {trip.destination
              ? `Click "Run Live Cost Audit" to benchmark your ${trip.currency} budget for ${trip.destination} against current real-world prices.`
              : 'Pick a destination in chat first, then run a Cost Reality Check to validate your budget.'}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Verdict Banner */}
            <div
              className={`p-3.5 rounded-md border ${
                rc.verdict === 'realistic'
                  ? 'bg-emerald-950/25 border-emerald-500/40'
                  : rc.verdict === 'tight'
                  ? 'bg-amber-950/25 border-amber-500/40'
                  : 'bg-red-950/25 border-red-500/40'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                  {rc.verdict === 'realistic' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertTriangle
                      className={`w-4 h-4 shrink-0 ${
                        rc.verdict === 'tight' ? 'text-amber-400' : 'text-red-400'
                      }`}
                    />
                  )}
                  <span>{rc.headline}</span>
                </div>
                <span className="text-xs font-mono tabular-nums text-slate-300">
                  Min {formatMoney(rc.recommendedMinimum, rc.currency, rc.currencySymbol)} · Comfortable{' '}
                  {formatMoney(rc.comfortableEstimate, rc.currency, rc.currencySymbol)}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">{rc.summary}</p>
            </div>

            {/* Market Comparison Table */}
            {rc.categories.length > 0 && (
              <div className="border border-[#24324A] rounded-md bg-[#0F172A] overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-[#131C2E] text-slate-400 border-b border-[#24324A]">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Category</th>
                      <th className="text-right px-3 py-2 font-medium">Market Range</th>
                      <th className="text-left px-3 py-2 font-medium">Assessment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E2B42]">
                    {rc.categories.map((cat, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2.5 text-slate-100 font-medium whitespace-nowrap">
                          {cat.label}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                          {formatMoney(cat.marketLow, rc.currency, rc.currencySymbol)} –{' '}
                          {formatMoney(cat.marketHigh, rc.currency, rc.currencySymbol)}
                        </td>
                        <td className="px-3 py-2.5 text-slate-300">
                          <span
                            className={`font-medium capitalize mr-1.5 ${
                              cat.status === 'realistic'
                                ? 'text-emerald-400'
                                : cat.status === 'tight'
                                ? 'text-amber-400'
                                : 'text-red-400'
                            }`}
                          >
                            {cat.status} ·
                          </span>
                          <span>{cat.note}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Actionable Saving Swaps */}
            {rc.savingSwaps.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-200">Practical Ways to Save</div>
                <div className="divide-y divide-[#1E2B42] border border-[#24324A] rounded-md bg-[#0F172A]">
                  {rc.savingSwaps.map((swap) => (
                    <div key={swap.id} className="p-3 flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-slate-100 flex flex-wrap items-center gap-2">
                          <span>{swap.title}</span>
                          {swap.estimatedSavings > 0 && (
                            <span className="font-mono tabular-nums text-emerald-400">
                              Save ~{formatMoney(swap.estimatedSavings, rc.currency, rc.currencySymbol)}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-1">{swap.description}</p>
                      </div>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => onApplySavingSwap(swap.actionPrompt)}
                        className="px-2.5 py-1.5 rounded-md border border-[#24324A] hover:border-cyan-500/50 bg-[#131C2E] text-xs text-cyan-300 transition flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        <span>Apply</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {rc.sources.length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                <span>Benchmarked via:</span>
                {rc.sources.slice(0, 4).map((s, i) => (
                  <a
                    key={i}
                    href={s.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-400 hover:text-cyan-300 inline-flex items-center gap-1 max-w-[180px] truncate"
                  >
                    <span className="truncate">{s.title}</span>
                    <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
