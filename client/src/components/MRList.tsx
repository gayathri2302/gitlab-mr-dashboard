import React, { useEffect, useState, useCallback, useRef } from 'react';
import { apiFor } from '../api';
import type { MR, MRListResponse } from '../types';

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
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState('opened');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [closingId, setClosingId] = useState<number | null>(null);
  const [pagination, setPagination] = useState<MRListResponse['pagination'] | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const observerRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const requestInFlightRef = useRef(false);
  const lastRequestRef = useRef<{ filter: string; search: string; page: number }>({ filter: '', search: '', page: 0 });

  const load = useCallback(async (state: string, page = 1, searchTerm = '', append = false) => {
    // Prevent duplicate requests
    if (requestInFlightRef.current) return;
    if (!append && lastRequestRef.current.filter === state && lastRequestRef.current.search === searchTerm && page === 1) return;
    if (append && lastRequestRef.current.page === page) return;

    requestInFlightRef.current = true;
    
    if (page === 1) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    setError('');

    try {
      const response: MRListResponse = await api.listMRs(state, page, 20, searchTerm);
      
      if (append) {
        setMrs(prev => [...prev, ...response.data]);
      } else {
        setMrs(response.data);
      }
      
      setPagination(response.pagination);
      setHasMore(page < response.pagination.totalPages);
      lastRequestRef.current = { filter: state, search: searchTerm, page };
    } catch {
      setError('Failed to load MRs');
      if (!append) setMrs([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      requestInFlightRef.current = false;
    }
  }, [api]);

  // Load data when filter or search changes (without including load in deps)
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // Debounce search requests
    if (search === '' && filter !== lastRequestRef.current.filter) {
      // Filter change without search - load immediately
      setMrs([]);
      setPagination(null);
      setHasMore(true);
      load(filter, 1, '', false);
    } else if (search !== '') {
      // Search change - debounce
      searchTimeoutRef.current = setTimeout(() => {
        setMrs([]);
        setPagination(null);
        setHasMore(true);
        load(filter, 1, search, false);
      }, 300);
    } else if (refreshKey) {
      // Refresh key change
      setMrs([]);
      setPagination(null);
      setHasMore(true);
      load(filter, 1, search, false);
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [filter, search, refreshKey, load]);

  // Infinite scrolling with minimal dependencies
  useEffect(() => {
    if (!observerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore && mrs.length > 0 && !requestInFlightRef.current) {
          const nextPage = (pagination?.page || 1) + 1;
          load(filter, nextPage, search, true);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(observerRef.current);

    return () => {
      if (observerRef.current) {
        observer.unobserve(observerRef.current);
      }
    };
  }, [pagination?.page, hasMore, mrs.length, filter, search, load]);

  const handleClose = async (e: React.MouseEvent, mr: MR) => {
    e.stopPropagation();
    if (!confirm(`Close MR !${mr.iid} "${mr.title}"?`)) return;
    setClosingId(mr.iid);
    try {
      await api.closeMR(mr.iid);
      setMrs(prev => prev.map(m => m.iid === mr.iid ? { ...m, state: 'closed' } : m));
      if (filter === 'opened') {
        setMrs(prev => prev.filter(m => m.iid !== mr.iid));
      }
    } catch { /* ignore */ }
    finally { setClosingId(null); }
  };

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
        <span className="text-xs text-gray-600">
          {pagination ? `${mrs.length} of ${pagination.totalCount} MR${pagination.totalCount !== 1 ? 's' : ''}` : `${mrs.length} MR${mrs.length !== 1 ? 's' : ''}`}
        </span>
        {loadingMore && <span className="text-xs text-gray-500">Loading more...</span>}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading && mrs.length === 0 && <div className="flex items-center justify-center h-24 text-gray-500 text-xs">Loading...</div>}
        {error && <div className="p-3 text-red-400 text-xs">{error}</div>}
        {!loading && mrs.map(mr => (
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
        
        {/* Infinite scroll trigger */}
        {hasMore && !loading && !loadingMore && mrs.length > 0 && (
          <div ref={observerRef} className="flex items-center justify-center py-4">
            <div className="text-xs text-gray-500">Loading more...</div>
          </div>
        )}
        
        {!loading && !loadingMore && !hasMore && mrs.length > 0 && (
          <div className="flex items-center justify-center py-4">
            <div className="text-xs text-gray-500">No more MRs to load</div>
          </div>
        )}
        
        {!loading && !error && mrs.length === 0 && (
          <div className="p-4 text-center text-gray-600 text-xs">
            {search ? 'No MRs found matching your search' : 'No MRs found'}
          </div>
        )}
      </div>
    </div>
  );
}
