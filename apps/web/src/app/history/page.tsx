'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { fetchHistory } from '@/lib/api';

const CATEGORIES = ['support', 'sales', 'billing', 'unknown'];

export default function HistoryPage() {
  const [category, setCategory] = useState('');
  const historyQuery = useQuery({
    queryKey: ['history', category],
    queryFn: () => fetchHistory(category || undefined),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Classification history</h2>
        <p className="mt-1 text-sm text-slate-600">
          Every classification is persisted; filter by category.
        </p>
      </div>

      <label className="flex max-w-sm flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">Filter by category</span>
        <select
          className="rounded border border-slate-300 bg-white px-2 py-1"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">All categories</option>
          {CATEGORIES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      {historyQuery.isLoading ? (
        <p className="text-sm text-slate-600">Loading…</p>
      ) : historyQuery.isError ? (
        <p className="text-sm text-red-700">Failed to load history.</p>
      ) : (historyQuery.data ?? []).length === 0 ? (
        <p className="text-sm text-slate-600">No classifications yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Confidence</th>
                <th className="px-4 py-3">Message</th>
                <th className="px-4 py-3">Provider</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(historyQuery.data ?? []).map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3">{new Date(row.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3">{row.category}</td>
                  <td className="px-4 py-3 tabular-nums">{row.confidence.toFixed(2)}</td>
                  <td className="max-w-md truncate px-4 py-3">{row.message}</td>
                  <td className="px-4 py-3">{row.provider}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
