import React, { useEffect, useState } from 'react';
import { apiFor } from '../api';
import DiffViewer from './DiffViewer';
import type { Diff } from '../types';

const TOKEN_KEY = 'mr_dash_token';

interface CommitMeta {
  id: string;
  short_id: string;
  title: string;
  message: string;
  author_name: string;
  authored_date: string;
  parent_ids: string[];
  web_url: string;
}

export default function CommitDiffPage() {
  const params = new URLSearchParams(window.location.search);
  const sha = params.get('sha') ?? '';
  const projectId = Number(params.get('project') ?? '0');

  // Seed auth token passed via URL so API calls work in the new tab
  const tokenParam = params.get('t');
  if (tokenParam) {
    sessionStorage.setItem(TOKEN_KEY, tokenParam);
    // Clean it from the URL so it doesn't stay visible
    const clean = new URL(window.location.href);
    clean.searchParams.delete('t');
    window.history.replaceState({}, '', clean.toString());
  }

  const [meta, setMeta] = useState<CommitMeta | null>(null);
  const [diffs, setDiffs] = useState<Diff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!sha || !projectId) {
      setError('Missing commit SHA or project ID.');
      setLoading(false);
      return;
    }
    const api = apiFor(projectId);
    Promise.all([api.getCommitDetail(sha), api.getCommitDiff(sha)])
      .then(([detail, diff]) => {
        setMeta(detail as unknown as CommitMeta);
        setDiffs(diff);
      })
      .catch(e => setError(e.message ?? 'Failed to load commit'))
      .finally(() => setLoading(false));
  }, [sha, projectId]);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900 px-6 py-3 flex items-center gap-3 sticky top-0 z-10">
        <svg className="w-4 h-4 text-orange-500 shrink-0" fill="currentColor" viewBox="0 0 24 24">
          <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z"/>
        </svg>
        <span className="text-xs font-bold text-gray-400">Commit diff</span>
        {meta && (
          <>
            <span className="text-gray-700">·</span>
            <span className="font-mono text-xs text-orange-400">{meta.short_id}</span>
            <span className="text-gray-700">·</span>
            <span className="text-xs text-gray-300 truncate max-w-xl">{meta.title}</span>
            <a
              href={meta.web_url}
              target="_blank"
              rel="noreferrer"
              className="ml-auto text-xs text-gray-500 hover:text-orange-400 shrink-0"
            >
              View on GitLab ↗
            </a>
          </>
        )}
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {loading && (
          <div className="text-gray-500 text-sm p-4">Loading commit diff...</div>
        )}

        {error && (
          <div className="text-red-400 text-sm p-4 bg-red-950 rounded border border-red-800">{error}</div>
        )}

        {!loading && !error && meta && (
          <>
            {/* Commit metadata */}
            <div className="mb-6 p-4 bg-gray-900 rounded border border-gray-800">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-100 leading-snug">{meta.title}</p>
                  {meta.message !== meta.title && (
                    <pre className="mt-2 text-xs text-gray-400 whitespace-pre-wrap font-mono leading-relaxed">
                      {meta.message.slice(meta.title.length).trim()}
                    </pre>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500">
                <span><span className="text-gray-600">Author</span> {meta.author_name}</span>
                <span><span className="text-gray-600">Date</span> {new Date(meta.authored_date).toLocaleString()}</span>
                <span><span className="text-gray-600">SHA</span> <span className="font-mono text-orange-400">{meta.id}</span></span>
                {meta.parent_ids.length > 0 && (
                  <span><span className="text-gray-600">Parent</span> <span className="font-mono text-gray-400">{meta.parent_ids[0].slice(0, 8)}</span></span>
                )}
              </div>
            </div>

            {/* File count summary */}
            <p className="text-xs text-gray-500 mb-3">
              {diffs.length} file{diffs.length !== 1 ? 's' : ''} changed
            </p>

            <DiffViewer diffs={diffs} />
          </>
        )}
      </div>
    </div>
  );
}
