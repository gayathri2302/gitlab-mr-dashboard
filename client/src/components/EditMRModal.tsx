import React, { useEffect, useRef, useState } from 'react';
import { apiFor } from '../api';
import type { MR } from '../types';

interface Props {
  mr: MR;
  projectId: number;
  onClose: () => void;
  onSaved: (updated: MR) => void;
}

function BranchSelect({
  label,
  value,
  onChange,
  branches,
  id,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  branches: string[];
  id: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = branches.filter(b =>
    b.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSelect = (branch: string) => {
    onChange(branch);
    setOpen(false);
    setSearch('');
  };

  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <div ref={containerRef} className="relative">
        <button
          type="button"
          onClick={() => { setOpen(v => !v); setSearch(''); }}
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 font-mono text-left flex items-center justify-between focus:outline-none focus:border-orange-500 hover:border-gray-600"
        >
          <span className="truncate">{value || 'Select branch...'}</span>
          <span className="text-gray-500 ml-2 shrink-0">{open ? '▲' : '▼'}</span>
        </button>

        {open && (
          <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded shadow-xl max-h-56 flex flex-col">
            <div className="p-2 border-b border-gray-700">
              <input
                autoFocus
                type="text"
                placeholder="Search branches..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-orange-500"
              />
            </div>
            <div className="overflow-y-auto flex-1">
              {filtered.length === 0 ? (
                <div className="text-xs text-gray-500 text-center py-3">No branches found</div>
              ) : (
                filtered.map(b => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => handleSelect(b)}
                    className={`w-full text-left px-3 py-2 text-xs font-mono truncate hover:bg-gray-700 transition-colors ${
                      b === value ? 'text-orange-400 bg-gray-750' : 'text-gray-200'
                    }`}
                  >
                    {b}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function EditMRModal({ mr, projectId, onClose, onSaved }: Props) {
  const api = apiFor(projectId);
  const [title, setTitle] = useState(mr.title);
  const [description, setDescription] = useState(mr.description ?? '');
  const [sourceBranch, setSourceBranch] = useState(mr.source_branch);
  const [targetBranch, setTargetBranch] = useState(mr.target_branch);
  const [branches, setBranches] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getBranches().then(list => setBranches(list.map((b: any) => b.name))).catch(() => {});
  }, [projectId]);

  const handleSave = async () => {
    if (!title.trim()) { setError('Title is required'); return; }
    setSaving(true);
    setError('');
    try {
      const updated = await api.updateMR(mr.iid, {
        title: title.trim(),
        description: description.trim(),
        source_branch: sourceBranch,
        target_branch: targetBranch,
      });
      onSaved(updated);
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Failed to update MR');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-5 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <h3 className="text-gray-100 font-semibold mb-4">Edit MR !{mr.iid}</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-orange-500"
            />
          </div>

          <BranchSelect
            label="Source Branch"
            value={sourceBranch}
            onChange={setSourceBranch}
            branches={branches}
            id="source-branch"
          />

          <BranchSelect
            label="Target Branch"
            value={targetBranch}
            onChange={setTargetBranch}
            branches={branches}
            id="target-branch"
          />

          <div>
            <label className="block text-xs text-gray-400 mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={6}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-orange-500 resize-none"
            />
          </div>
        </div>

        {error && (
          <div className="mt-3 text-xs text-red-400 bg-red-950 px-3 py-2 rounded">{error}</div>
        )}

        <div className="flex gap-2 justify-end mt-4">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-xs px-3 py-1.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white rounded"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
