import React, { useEffect, useState } from 'react';
import { apiFor } from '../api';
import type { MR } from '../types';

function renderWithJiraLinks(text: string) {
  const parts = text.split(/(NGSB[-\s]\d+)/gi);
  return parts.map((part, i) =>
    /^NGSB[-\s]\d+$/i.test(part) ? (
      <a
        key={i}
        href={`https://jiraims.rm.imshealth.com/browse/${part.replace(/\s/, '-').toUpperCase()}`}
        target="_blank"
        rel="noreferrer"
        onClick={e => e.stopPropagation()}
        className="text-blue-400 hover:text-blue-300 hover:underline"
      >
        {part}
      </a>
    ) : part
  );
}

interface Props {
  projectId: number;
  selectedIid: number | null;
  onSelect: (mr: MR) => void;
  onCreateMR: () => void;
  refreshKey?: number;
}

const statusColor: Record<string, string> = {
  mergeable: 'bg-green-500',
  not_open: 'bg-gray-500',
  conflicts: 'bg-red-500',
  unchecked: 'bg-yellow-500',
  checking: 'bg-blue-500',
};

const stateColor: Record<string, string> = {
  opened: 'text-green-400',
  merged: 'text-purple-400',
  closed: 'text-red-400',
};

export default function MRList({ projectId, selectedIid, onSelect, onCreateMR, refreshKey }: Props) {
  const api = apiFor(projectId);
  const [mrs, setMrs] = useState<MR[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('opened');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [closingId, setClosingId] = useState<number | null>(null);

  const load = async (state: string) => {
    setLoading(true);
    setError('');
    try {
      setMrs(await api.listMRs(state));
    } catch {
      setError('Failed to load MRs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(filter); }, [filter, projectId, refreshKey]);

  const handleClose = async (e: React.MouseEvent, mr: MR) => {
    e.stopPropagation();
    if (!confirm(`Close MR !${mr.iid} "${mr.title}"?`)) return;
    setClosingId(mr.iid);
    try {
      await api.closeMR(mr.iid);
      setMrs(prev => prev.map(m => m.iid === mr.iid ? { ...m, state: 'closed' } : m));
      if (filter === 'opened') setMrs(prev => prev.filter(m => m.iid !== mr.iid));
    } catch { /* ignore */ }
    finally { setClosingId(null); }
  };

  const filtered = mrs.filter(mr =>
    mr.title.toLowerCase().includes(search.toLowerCase()) ||
    String(mr.iid).includes(search) ||
    mr.source_branch.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="p-3 border-b border-gray-800">
        {/* State tabs */}
        <div className="flex gap-1 mb-2">
          {['opened', 'merged', 'closed'].map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`flex-1 text-xs py-1 rounded transition-colors ${
                filter === s ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-orange-500 mb-2"
        />

        {/* New MR button */}
        <button
          onClick={onCreateMR}
          className="w-full text-xs bg-orange-600 hover:bg-orange-500 text-white py-1.5 rounded flex items-center justify-center gap-1"
        >
          <span className="text-base leading-none">+</span> New MR
        </button>
      </div>

      {/* Count */}
      <div className="px-3 py-1.5 border-b border-gray-800 flex items-center justify-between">
        <span className="text-xs text-gray-600">{filtered.length} MR{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading && <div className="flex items-center justify-center h-24 text-gray-500 text-xs">Loading...</div>}
        {error && <div className="p-3 text-red-400 text-xs">{error}</div>}
        {!loading && filtered.map(mr => (
          <div
            key={mr.id}
            onClick={() => onSelect(mr)}
            className={`relative group px-3 py-2.5 border-b border-gray-800 hover:bg-gray-800 cursor-pointer transition-colors ${
              selectedIid === mr.iid ? 'bg-gray-800 border-l-2 border-l-orange-500' : ''
            }`}
          >
            <div className="flex items-start gap-2 pr-6">
              <span className="text-orange-400 text-xs font-mono shrink-0 mt-0.5">!{mr.iid}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-200 leading-snug line-clamp-2">
                  {mr.draft && <span className="text-gray-500">[Draft] </span>}
                  {renderWithJiraLinks(mr.title)}
                </p>
                <p className="text-xs text-gray-600 truncate mt-0.5">{mr.source_branch}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs ${stateColor[mr.state] || 'text-gray-400'}`}>{mr.state}</span>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusColor[mr.detailed_merge_status] || 'bg-gray-600'}`} />
                  <span className="text-xs text-gray-600 truncate">{mr.author.name}</span>
                </div>
                <p className="text-xs text-gray-700 mt-0.5">{new Date(mr.updated_at).toLocaleDateString()}</p>
              </div>
            </div>

            {/* Close button (only for opened MRs) */}
            {mr.state === 'opened' && (
              <button
                onClick={e => handleClose(e, mr)}
                disabled={closingId === mr.iid}
                title="Close MR"
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center text-gray-500 hover:text-red-400 hover:bg-red-950 rounded text-xs"
              >
                {closingId === mr.iid ? '…' : '✕'}
              </button>
            )}
          </div>
        ))}
        {!loading && !filtered.length && !error && (
          <div className="p-4 text-center text-gray-600 text-xs">No MRs found</div>
        )}
      </div>
    </div>
  );
}
