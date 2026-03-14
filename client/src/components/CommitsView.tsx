import React, { useEffect, useState } from 'react';
import type { Commit } from '../types';

interface Props {
  mrIid: number;
  loadCommits: () => Promise<Commit[]>;
  onCountLoaded?: (n: number) => void;
}

export default function CommitsView({ mrIid, loadCommits, onCountLoaded }: Props) {
  const [commits, setCommits] = useState<Commit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    loadCommits()
      .then(c => { setCommits(c); onCountLoaded?.(c.length); })
      .finally(() => setLoading(false));
  }, [mrIid]);

  if (loading) return <div className="p-4 text-gray-500 text-sm">Loading commits...</div>;
  if (!commits.length) return <div className="p-4 text-gray-500 text-sm">No commits found.</div>;

  return (
    <div className="space-y-1">
      <p className="text-xs text-gray-500 mb-3">{commits.length} commit{commits.length !== 1 ? 's' : ''}</p>
      {commits.map(c => (
        <div key={c.id} className="flex items-start gap-3 p-3 bg-gray-800 rounded hover:bg-gray-750 transition-colors group">
          <span className="font-mono text-xs text-orange-400 shrink-0 mt-0.5 w-16">{c.short_id}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-200 leading-snug">{c.title}</p>
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
              <span>{c.author_name}</span>
              <span>{new Date(c.authored_date).toLocaleString()}</span>
            </div>
          </div>
          <a
            href={c.web_url}
            target="_blank"
            rel="noreferrer"
            className="text-gray-600 hover:text-orange-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          >
            ↗
          </a>
        </div>
      ))}
    </div>
  );
}
