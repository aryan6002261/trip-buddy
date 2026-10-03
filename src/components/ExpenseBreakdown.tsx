import React from 'react';
import { Hotel, Plane, Utensils, Compass, PieChart as PieChartIcon } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { ParsedTripDetails } from '../types';

interface ExpenseBreakdownProps {
  parsed?: ParsedTripDetails | null;
}

export const ExpenseBreakdown: React.FC<ExpenseBreakdownProps> = ({ parsed }) => {
  const budget = parsed?.budget || 15000;
  const currency = parsed?.currency || '₹';
  const duration = parsed?.duration || 5;

  const isLuxury = parsed?.travel_style?.toLowerCase().includes('comfort') || parsed?.travel_style?.toLowerCase().includes('luxury');
  const isBudget = parsed?.travel_style?.toLowerCase().includes('budget') || parsed?.travel_style?.toLowerCase().includes('backpacker');

  const hotelShare = isLuxury ? 0.45 : (isBudget ? 0.35 : 0.40);
  const transportShare = isLuxury ? 0.25 : (isBudget ? 0.30 : 0.28);
  const foodShare = isLuxury ? 0.20 : (isBudget ? 0.25 : 0.22);
  const activityShare = 1.0 - (hotelShare + transportShare + foodShare);

  const hotelAmount = Math.round(budget * hotelShare);
  const transportAmount = Math.round(budget * transportShare);
  const foodAmount = Math.round(budget * foodShare);
  const activityAmount = Math.round(budget * activityShare);

  const data = [
    { name: 'Accommodation / Stays', value: hotelAmount, percentage: Math.round(hotelShare * 100), color: '#10b981', icon: Hotel },
    { name: 'Transport & Flights', value: transportAmount, percentage: Math.round(transportShare * 100), color: '#3b82f6', icon: Plane },
    { name: 'Food & Dining', value: foodAmount, percentage: Math.round(foodShare * 100), color: '#f59e0b', icon: Utensils },
    { name: 'Activities & Sights', value: activityAmount, percentage: Math.round(activityShare * 100), color: '#6366f1', icon: Compass },
  ];

  return (
    <div className="p-6 rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <PieChartIcon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Trip Expense Donut Summary</h3>
            <p className="text-xs text-slate-400">
              Active plan breakdown for {duration} days in {parsed?.destination || 'Destination'}
            </p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-xs text-slate-400 block">Total Budget</span>
          <span className="text-lg font-extrabold text-emerald-400">
            {currency}{budget.toLocaleString()}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
        {/* Recharts Donut Chart */}
        <div className="h-64 w-full bg-slate-950/60 rounded-2xl border border-slate-800 p-2 flex items-center justify-center relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={65}
                outerRadius={95}
                paddingAngle={4}
                dataKey="value"
                stroke="none"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const dataItem = payload[0].payload;
                    return (
                      <div className="bg-slate-900 border border-slate-700 p-3 rounded-xl shadow-xl text-xs space-y-1">
                        <div className="font-bold text-white flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: dataItem.color }} />
                          {dataItem.name}
                        </div>
                        <div className="text-emerald-400 font-extrabold text-sm">
                          {currency}{dataItem.value.toLocaleString()} ({dataItem.percentage}%)
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">Total</span>
            <span className="text-sm font-extrabold text-white">{currency}{budget.toLocaleString()}</span>
          </div>
        </div>

        {/* Legend & Breakdown Cards */}
        <div className="space-y-3">
          {data.map((item, idx) => {
            const IconComp = item.icon;
            return (
              <div
                key={idx}
                className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between hover:border-slate-600 transition"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 shadow-sm"
                    style={{ backgroundColor: item.color }}
                  >
                    <IconComp className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-white block">{item.name}</span>
                    <span className="text-[11px] text-slate-400">{item.percentage}% of budget</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-sm font-extrabold text-white">
                    {currency}{item.value.toLocaleString()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
