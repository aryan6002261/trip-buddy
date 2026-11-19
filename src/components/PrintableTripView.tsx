import React from 'react';
import { TripWorkspace } from '../types';
import { formatMoney } from '../lib/storage';

interface PrintableTripViewProps {
  trip: TripWorkspace;
}

export const PrintableTripView: React.FC<PrintableTripViewProps> = ({ trip }) => {
  const plannedTotal =
    (trip.budgetEstimate.flights || 0) +
    (trip.budgetEstimate.stay || 0) +
    (trip.budgetEstimate.food || 0) +
    (trip.budgetEstimate.activities || 0) +
    (trip.budgetEstimate.misc || 0);
  const actualTotal = trip.expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  return (
    <div className="hidden print-only p-8 bg-white text-slate-900 font-sans">
      <div className="border-b-2 border-slate-900 pb-4 mb-6">
        <div className="text-xs uppercase tracking-wider text-slate-500">TripBuddy Travel Dossier</div>
        <h1 className="text-2xl font-bold mt-1">{trip.title || trip.destination || 'Trip Plan'}</h1>
        <p className="text-sm text-slate-600 mt-1">
          {[
            trip.origin ? `From ${trip.origin}` : null,
            trip.destination ? `To ${trip.destination}${trip.country ? `, ${trip.country}` : ''}` : null,
            trip.durationDays ? `${trip.durationDays} Days` : null,
            trip.targetBudget ? `Target ${formatMoney(trip.targetBudget, trip.currency, trip.currencySymbol)}` : null,
            `Pace: ${trip.paceProfile.pace} (${trip.paceProfile.wakeWindow} wake)`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>

      {/* Budget Summary */}
      <div className="mb-6 grid grid-cols-3 gap-4 border border-slate-300 rounded p-3 text-sm">
        <div>
          <div className="text-xs text-slate-500">Planned Estimate</div>
          <div className="font-bold font-mono">{formatMoney(plannedTotal, trip.currency, trip.currencySymbol)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Actual Logged</div>
          <div className="font-bold font-mono">{formatMoney(actualTotal, trip.currency, trip.currencySymbol)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Travelers</div>
          <div className="font-bold font-mono">{trip.travelersCount}</div>
        </div>
      </div>

      {/* Itinerary */}
      {trip.days.map((day) => (
        <div key={day.day} className="mb-6 break-inside-avoid">
          <h2 className="text-base font-bold border-b border-slate-300 pb-1 mb-2">
            Day {day.day}: {day.title}
          </h2>
          {day.summary && <p className="text-xs text-slate-600 mb-2">{day.summary}</p>}
          <div className="space-y-2">
            {day.stops.map((stop) => (
              <div key={stop.id} className="text-xs">
                <div className="font-semibold">
                  {stop.timeWindow} — {stop.title}
                  {stop.neighborhood ? ` (${stop.neighborhood})` : ''}
                  {stop.estimatedCost > 0
                    ? ` · ${formatMoney(stop.estimatedCost, trip.currency, trip.currencySymbol)}`
                    : ''}
                </div>
                <div className="text-slate-600">{stop.description}</div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Custom Sections */}
      {trip.customSections.map((sec) => (
        <div key={sec.id} className="mb-5 break-inside-avoid">
          <h2 className="text-base font-bold border-b border-slate-300 pb-1 mb-2">{sec.title}</h2>
          <pre className="whitespace-pre-wrap font-sans text-xs text-slate-700">{sec.contentMarkdown}</pre>
        </div>
      ))}

      {/* Group Consensus */}
      {trip.groupConsensus && (
        <div className="mb-5 break-inside-avoid">
          <h2 className="text-base font-bold border-b border-slate-300 pb-1 mb-2">Group Consensus Notes</h2>
          <p className="text-xs text-slate-700">{trip.groupConsensus.summary}</p>
        </div>
      )}
    </div>
  );
};
