import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
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

type SortBy = 'updated_desc' | 'created_desc' | 'id_desc' | 'id_asc';

function parseSortBy(s: SortBy): { orderBy: string; sort: string } {
  switch (s) {
    case 'created_desc': return { orderBy: 'created_at', sort: 'desc' };
    case 'id_desc':      return { orderBy: 'id',         sort: 'desc' };
    case 'id_asc':       return { orderBy: 'id',         sort: 'asc'  };
    default:             return { orderBy: 'updated_at', sort: 'desc' };
  }
}

export default function MRList({ projectId, selectedIid, onSelect, onCreateMR, refreshKey }: Props) {
  const api = useMemo(() => apiFor(projectId), [projectId]);
  const [mrs, setMrs] = useState<MR[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState('opened');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [closingId, setClosingId] = useState<number | null>(null);
  const [pagination, setPagination] = useState<MRListResponse['pagination'] | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const observerRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const abortControllerRef = useRef<AbortController | null>(null);

  // Advanced filters
  const [showFilters, setShowFilters] = useState(false);
  const [sourceBranch, setSourceBranch] = useState('');
  const [targetBranch, setTargetBranch] = useState('');
  const [authorFilter, setAuthorFilter] = useState('');
  const [mergedByFilter, setMergedByFilter] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('updated_desc');

  // Refs for stable IntersectionObserver callback
  const hasMoreRef = useRef(hasMore);
  const loadingRef = useRef(loading);
  const loadingMoreRef = useRef(loadingMore);
  const paginationRef = useRef(pagination);
  const filterRef = useRef(filter);
  const searchRef = useRef(search);
  const mrsLengthRef = useRef(mrs.length);
  const sourceBranchRef   = useRef(sourceBranch);
  const targetBranchRef   = useRef(targetBranch);
  const authorFilterRef   = useRef(authorFilter);
  const mergedByFilterRef = useRef(mergedByFilter);
  const sortByRef         = useRef(sortBy);

  hasMoreRef.current = hasMore;
  loadingRef.current = loading;
  loadingMoreRef.current = loadingMore;
  paginationRef.current = pagination;
  filterRef.current = filter;
  searchRef.current = search;
  mrsLengthRef.current = mrs.length;
  sourceBranchRef.current   = sourceBranch;
  targetBranchRef.current   = targetBranch;
  authorFilterRef.current   = authorFilter;
  mergedByFilterRef.current = mergedByFilter;
  sortByRef.current         = sortBy;

  // When search is a pure number, look up that MR by iid directly —
  // this works for both opened and merged MRs without changing the filter tab.
  const loadMRByIid = async (iid: number) => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError('');
    try {
      const mr = await api.getMR(iid, controller.signal);
      if (controller.signal.aborted) return;
      setMrs(mr ? [mr] : []);
      setPagination(null);
      setHasMore(false);
    } catch (e: any) {
      if (controller.signal.aborted) return;
      setMrs([]);
      setError(`MR !${iid} not found`);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  };

  const loadMRs = async (state: string, page = 1, searchTerm = '', append = false) => {
    // Abort any previous in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (page === 1) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    setError('');

    try {
      const { orderBy, sort } = parseSortBy(sortByRef.current);
      const response = await api.listMRs(state, page, 20, searchTerm, {
        sourceBranch:     sourceBranchRef.current,
        targetBranch:     targetBranchRef.current,
        authorUsername:   authorFilterRef.current,
        mergedByUsername: mergedByFilterRef.current,
        orderBy,
        sort,
      }, controller.signal);

      // If this request was aborted while awaiting, discard its results
      if (controller.signal.aborted) return;

      // Handle both wrapped { data, pagination } and raw array responses
      let items: MR[] = Array.isArray(response) ? response : response.data;
      const pag = Array.isArray(response)
        ? { page, perPage: 20, totalPages: items.length < 20 ? page : page + 1, totalCount: 0 }
        : response.pagination;

      // Client-side filter: GitLab search can return non-matching results
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        items = items.filter(mr =>
          mr.title.toLowerCase().includes(term) ||
          mr.author.name.toLowerCase().includes(term) ||
          mr.author.username.toLowerCase().includes(term)
        );
      }

      if (append) {
        setMrs(prev => [...prev, ...items]);
      } else {
        setMrs(items);
      }

      setPagination(pag);
      setHasMore(page < pag.totalPages);
    } catch (e: any) {
      // Ignore errors from aborted requests
      if (controller.signal.aborted) return;
      setError('Failed to load MRs');
      if (!append) setMrs([]);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  };

  // Initial load on mount and when filter/search change
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    const iidSearch = search.trim().match(/^!?(\d+)$/);

    if (iidSearch) {
      // Numeric search (e.g. "123" or "!123") — look up by MR number directly,
      // works for both opened and merged regardless of the active filter tab.
      searchTimeoutRef.current = setTimeout(() => {
        setMrs([]);
        setPagination(null);
        setHasMore(false);
        loadMRByIid(Number(iidSearch[1]));
      }, 300);
    } else if (search) {
      // Text search — debounce then fetch from current filter tab
      searchTimeoutRef.current = setTimeout(() => {
        setMrs([]);
        setPagination(null);
        setHasMore(true);
        loadMRs(filter, 1, search, false);
      }, 300);
    } else {
      // No search — load current filter tab immediately
      setMrs([]);
      setPagination(null);
      setHasMore(true);
      loadMRs(filter, 1, '', false);
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [filter, search, refreshKey, sourceBranch, targetBranch, authorFilter, mergedByFilter, sortBy]);

  // Infinite scrolling — use refs so the observer is stable and not recreated on every load
  useEffect(() => {
    const el = observerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          hasMoreRef.current &&
          !loadingRef.current &&
          !loadingMoreRef.current &&
          mrsLengthRef.current > 0 &&
          paginationRef.current
        ) {
          const nextPage = paginationRef.current.page + 1;
          loadMRs(filterRef.current, nextPage, searchRef.current, true);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(el);

    return () => observer.disconnect();
  }, []);

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

  const activeFilterCount =
    [sourceBranch, targetBranch, authorFilter, mergedByFilter].filter(Boolean).length +
    (sortBy !== 'updated_desc' ? 1 : 0);

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
          placeholder="Search by title, author or MR number (!123)…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-orange-500 mb-2"
        />

        {/* Filter toggle row */}
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => setShowFilters(f => !f)}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
              showFilters ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            <span className="text-gray-400">{showFilters ? '▲' : '▼'}</span>
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="ml-0.5 bg-orange-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>
          {activeFilterCount > 0 && (
            <button
              onClick={() => {
                setSourceBranch('');
                setTargetBranch('');
                setAuthorFilter('');
                setMergedByFilter('');
                setSortBy('updated_desc');
              }}
              className="text-xs text-gray-500 hover:text-orange-400 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="mb-2 border border-gray-700 rounded p-2 space-y-1.5 bg-gray-900/50">
            {/* Source Branch */}
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500 w-16 shrink-0">Source</label>
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="branch name…"
                  value={sourceBranch}
                  onChange={e => setSourceBranch(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-orange-500 pr-5"
                />
                {sourceBranch && (
                  <button
                    onClick={() => setSourceBranch('')}
                    className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-xs leading-none"
                  >×</button>
                )}
              </div>
            </div>
            {/* Target Branch */}
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500 w-16 shrink-0">Target</label>
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="branch name…"
                  value={targetBranch}
                  onChange={e => setTargetBranch(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-orange-500 pr-5"
                />
                {targetBranch && (
                  <button
                    onClick={() => setTargetBranch('')}
                    className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-xs leading-none"
                  >×</button>
                )}
              </div>
            </div>
            {/* Author */}
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500 w-16 shrink-0">Author</label>
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="name or username…"
                  value={authorFilter}
                  onChange={e => setAuthorFilter(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-orange-500 pr-5"
                />
                {authorFilter && (
                  <button
                    onClick={() => setAuthorFilter('')}
                    className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-xs leading-none"
                  >×</button>
                )}
              </div>
            </div>
            {/* Merged by — only relevant on merged tab */}
            <div className="flex items-center gap-1.5">
              <label className={`text-xs w-16 shrink-0 ${filter === 'merged' ? 'text-gray-500' : 'text-gray-700'}`}>
                Merged by
              </label>
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder={filter === 'merged' ? 'name or username…' : 'merged tab only'}
                  value={mergedByFilter}
                  onChange={e => setMergedByFilter(e.target.value)}
                  disabled={filter !== 'merged'}
                  className={`w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs placeholder-gray-600 focus:outline-none focus:border-orange-500 pr-5 ${
                    filter === 'merged' ? 'text-gray-200' : 'text-gray-700 cursor-not-allowed opacity-50'
                  }`}
                />
                {mergedByFilter && filter === 'merged' && (
                  <button
                    onClick={() => setMergedByFilter('')}
                    className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-xs leading-none"
                  >×</button>
                )}
              </div>
            </div>
            {/* Sort */}
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500 w-16 shrink-0">Sort</label>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as SortBy)}
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-orange-500"
              >
                <option value="updated_desc">Updated ↓ (default)</option>
                <option value="created_desc">Created ↓</option>
                <option value="id_desc">MR# ↓ (newest first)</option>
                <option value="id_asc">MR# ↑ (oldest first)</option>
              </select>
            </div>
          </div>
        )}

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
        
        {/* Infinite scroll sentinel — always rendered so observer stays attached */}
        <div ref={observerRef} style={{ height: 1 }} />
        
        {!loading && !loadingMore && !hasMore && mrs.length > 0 && (
          <div className="flex items-center justify-center py-4">
            <div className="text-xs text-gray-500">No more MRs to load</div>
          </div>
        )}
        
        {!loading && !error && mrs.length === 0 && (
          <div className="p-4 text-center text-gray-600 text-xs">
            {search
              ? search.trim().match(/^!?(\d+)$/)
                ? `No MR found with number !${search.trim().replace(/^!/, '')}`
                : 'No MRs found matching your search'
              : 'No MRs found'}
          </div>
        )}
      </div>
    </div>
  );
}
