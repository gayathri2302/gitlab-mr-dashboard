import React, { useState } from 'react';
import MRList from './components/MRList';
import MRDetail from './components/MRDetail';
import CreateMRModal from './components/CreateMRModal';
import RepoPipelines from './components/RepoPipelines';
import type { MR } from './types';
import { REPOS } from './types';

type ViewMode = 'mrs' | 'pipelines';

const repoTabColors: Record<string, string> = {
  blue:   'data-[active=true]:text-blue-400   data-[active=true]:border-blue-400',
  green:  'data-[active=true]:text-green-400  data-[active=true]:border-green-400',
  purple: 'data-[active=true]:text-purple-400 data-[active=true]:border-purple-400',
  orange: 'data-[active=true]:text-orange-400 data-[active=true]:border-orange-400',
};

const repoActiveBg: Record<string, string> = {
  blue:   'bg-blue-500',
  green:  'bg-green-500',
  purple: 'bg-purple-500',
  orange: 'bg-orange-500',
};

export default function App() {
  const [activeRepoIdx, setActiveRepoIdx] = useState(0);
  const [selectedMR, setSelectedMR] = useState<MR | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showCreateMR, setShowCreateMR] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('mrs');

  const repo = REPOS[activeRepoIdx];

  const handleRepoChange = (idx: number) => {
    setActiveRepoIdx(idx);
    setSelectedMR(null);
    setViewMode('mrs');
  };

  const handleViewChange = (mode: ViewMode) => {
    setViewMode(mode);
    if (mode === 'pipelines') {
      setSelectedMR(null);
    }
  };

  const handleMutated = (updated?: MR) => {
    setRefreshKey(k => k + 1);
    if (updated) setSelectedMR(updated);
  };

  const handleCreated = (mr: MR) => {
    setShowCreateMR(false);
    setRefreshKey(k => k + 1);
    setSelectedMR(mr);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950 flex-col">
      {/* ── Top header ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-0 border-b border-gray-800 bg-gray-900 shrink-0">
        <div className="flex items-center gap-0 overflow-hidden flex-1">
          {/* Logo */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-r border-gray-800 shrink-0">
            <svg className="w-5 h-5 text-orange-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z"/>
            </svg>
            <span className="text-xs font-bold text-gray-200 whitespace-nowrap">MR Dashboard</span>
          </div>

          {/* Repo tabs */}
          <div className="flex items-stretch overflow-x-auto">
            {REPOS.map((r, i) => (
              <button
                key={r.id}
                onClick={() => handleRepoChange(i)}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeRepoIdx === i
                    ? `border-${r.color}-400 text-${r.color}-300`
                    : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${activeRepoIdx === i ? repoActiveBg[r.color] : 'bg-gray-600'}`} />
                {r.label}
                <span className="text-gray-600 text-xs hidden lg:inline truncate max-w-[120px]">{r.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-0 border-l border-gray-800">
          {([
            { value: 'mrs', label: 'Merge Requests' },
            { value: 'pipelines', label: 'Pipelines' },
          ] as Array<{ value: ViewMode; label: string }>).map(option => (
            <button
              key={option.value}
              onClick={() => handleViewChange(option.value)}
              data-active={viewMode === option.value}
              className="px-4 py-2.5 text-xs font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-200 data-[active=true]:text-orange-300 data-[active=true]:border-orange-400"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {viewMode === 'mrs' ? (
          <>
            <div className="w-72 shrink-0 border-r border-gray-800 flex flex-col">
              <MRList
                key={`${repo.id}-${refreshKey}`}
                projectId={repo.id}
                selectedIid={selectedMR?.iid ?? null}
                onSelect={setSelectedMR}
                onCreateMR={() => setShowCreateMR(true)}
                refreshKey={refreshKey}
              />
            </div>

            <div className="flex-1 overflow-hidden">
              {selectedMR ? (
                <MRDetail
                  key={`${repo.id}-${selectedMR.iid}`}
                  mr={selectedMR}
                  projectId={repo.id}
                  onMutated={handleMutated}
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-700">
                  <svg className="w-14 h-14 mb-3 opacity-20" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z"/>
                  </svg>
                  <p className="text-sm">Select a merge request</p>
                  <p className="text-xs mt-1 text-gray-800">{repo.label} · {repo.name}</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-hidden">
            <RepoPipelines projectId={repo.id} />
          </div>
        )}
      </div>

      {/* Create MR modal */}
      {viewMode === 'mrs' && showCreateMR && (
        <CreateMRModal
          projectId={repo.id}
          onClose={() => setShowCreateMR(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
