import React, { useEffect, useRef, useState } from 'react';
import { apiFor } from '../api';
import { REPOS } from '../types';
import type { MR } from '../types';

interface Props {
  projectId: number;
  onClose: () => void;
  onCreated: (mr: MR) => void;
}

export default function CreateMRModal({ projectId, onClose, onCreated }: Props) {
  const api = apiFor(projectId);
  const repo = REPOS.find(r => r.id === projectId);

  const [branches, setBranches] = useState<string[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [form, setForm] = useState({
    source_branch: '',
    target_branch: 'DEV',
    title: '',
    description: '',
    draft: false,
  });
  const [inputText, setInputText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Fetch branches (debounced on search, eager on focus)
  const fetchBranches = (search: string) => {
    setBranchesLoading(true);
    api.getBranches(search || undefined)
      .then(b => setBranches(b.map((br: any) => br.name)))
      .catch(() => setBranches([]))
      .finally(() => setBranchesLoading(false));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputText(val);
    setForm(f => ({ ...f, source_branch: '' })); // clear confirmed selection
    setShowDropdown(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchBranches(val), 300);
  };

  const handleInputFocus = () => {
    setShowDropdown(true);
    if (!branches.length) fetchBranches(inputText);
  };

  const selectBranch = (name: string) => {
    setForm(f => ({
      ...f,
      source_branch: name,
      title: f.title || name.replace(/^(feat|fix|bugfix|feature|chore|hotfix)\//i, '').replace(/-/g, ' '),
    }));
    setInputText(name);
    setShowDropdown(false);
  };

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.source_branch) { setError('Please select a source branch from the list.'); return; }
    if (!form.target_branch || !form.title.trim()) { setError('Target branch and title are required.'); return; }
    setSubmitting(true);
    setError('');
    try {
      const mr = await api.createMR({
        source_branch: form.source_branch,
        target_branch: form.target_branch,
        title: form.draft ? `Draft: ${form.title}` : form.title,
        description: form.description,
        draft: form.draft,
      });
      onCreated(mr);
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Failed to create MR');
    } finally {
      setSubmitting(false);
    }
  };

  const isSelected = !!form.source_branch;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <div>
            <h2 className="text-gray-100 font-semibold">New Merge Request</h2>
            {repo && (
              <p className="text-xs text-gray-500 mt-0.5">
                <span className={`text-${repo.color}-400`}>{repo.label}</span>
                {' · '}{repo.name}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Source branch */}
          <div className="relative" ref={wrapperRef}>
            <label className="block text-xs text-gray-400 mb-1">Source branch *</label>
            <div className="relative">
              <input
                type="text"
                value={inputText}
                onChange={handleInputChange}
                onFocus={handleInputFocus}
                placeholder="Type to search branches..."
                autoComplete="off"
                className={`w-full bg-gray-800 border rounded px-3 py-2 text-sm text-gray-200 focus:outline-none pr-8 ${
                  isSelected
                    ? 'border-green-600 focus:border-green-500'
                    : 'border-gray-600 focus:border-orange-500'
                }`}
              />
              {isSelected && (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-green-400 text-sm">✓</span>
              )}
              {branchesLoading && !isSelected && (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-xs">…</span>
              )}
            </div>

            {showDropdown && branches.length > 0 && (
              <div className="absolute z-20 w-full bg-gray-800 border border-gray-600 rounded mt-1 max-h-52 overflow-y-auto shadow-2xl">
                {branches.map(b => (
                  <button
                    key={b}
                    type="button"
                    onMouseDown={e => { e.preventDefault(); selectBranch(b); }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-700 truncate flex items-center gap-2 ${
                      form.source_branch === b ? 'text-orange-400 bg-gray-750' : 'text-gray-300'
                    }`}
                  >
                    <span className="text-gray-600 text-xs font-mono shrink-0">⎇</span>
                    <span className="truncate">{b}</span>
                  </button>
                ))}
              </div>
            )}

            {showDropdown && !branchesLoading && branches.length === 0 && inputText && (
              <div className="absolute z-20 w-full bg-gray-800 border border-gray-600 rounded mt-1 px-3 py-2 text-sm text-gray-500 shadow-2xl">
                No branches match "{inputText}"
              </div>
            )}
          </div>

          {/* Target branch */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Target branch *</label>
            <select
              value={form.target_branch}
              onChange={e => set('target_branch', e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-orange-500"
            >
              {['DEV', 'QA', 'UAT', 'CLIENTUAT', 'PROD', 'main', 'master'].map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Title *</label>
            <input
              type="text"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="MR title..."
              className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-orange-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={3}
              placeholder="Describe your changes..."
              className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-orange-500 resize-none"
            />
          </div>

          {/* Draft toggle */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div
              onClick={() => set('draft', !form.draft)}
              className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${form.draft ? 'bg-purple-600' : 'bg-gray-600'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${form.draft ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-sm text-gray-300">Mark as draft</span>
          </label>

          {error && <p className="text-red-400 text-xs bg-red-950 px-3 py-2 rounded">{error}</p>}

          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} className="text-sm px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="text-sm px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white rounded"
            >
              {submitting ? 'Creating...' : 'Create MR'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
