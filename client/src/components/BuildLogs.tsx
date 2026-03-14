import React, { useEffect, useState, useRef } from 'react';
import { apiFor } from '../api';
import type { Job } from '../types';

interface Props {
  job: Job;
  projectId: number;
  onClose: () => void;
}

// Strip ANSI escape codes for display
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*[mGKH]/g, '').replace(/\x1b\[\?[0-9;]*[hl]/g, '');
}

export default function BuildLogs({ job, projectId, onClose }: Props) {
  const api = apiFor(projectId);
  const [log, setLog] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getJobTrace(job.id)
      .then(data => {
        setLog(stripAnsi(String(data)));
      })
      .catch(() => setError('Failed to fetch logs'))
      .finally(() => setLoading(false));
  }, [job.id]);

  useEffect(() => {
    if (!loading) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [loading]);

  const lines = log.split('\n');
  const displayLines = showAll ? lines : lines.slice(-100);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-4xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-700 shrink-0">
          <span className="text-red-400 text-sm font-semibold">✗ Failed Job: {job.name}</span>
          <span className="text-gray-500 text-xs">Stage: {job.stage}</span>
          {job.duration && (
            <span className="text-gray-500 text-xs">{Math.round(job.duration)}s</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <a
              href={job.web_url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-orange-400 hover:underline"
            >
              Open in GitLab ↗
            </a>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white text-lg leading-none"
            >
              ×
            </button>
          </div>
        </div>

        {/* Log controls */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-800 shrink-0 bg-gray-850">
          <span className="text-xs text-gray-500">{lines.length} lines total</span>
          {!showAll && lines.length > 100 && (
            <button
              onClick={() => setShowAll(true)}
              className="text-xs text-orange-400 hover:underline"
            >
              Show all {lines.length} lines
            </button>
          )}
          {showAll && (
            <button
              onClick={() => setShowAll(false)}
              className="text-xs text-orange-400 hover:underline"
            >
              Show last 100 lines
            </button>
          )}
          <button
            onClick={() => navigator.clipboard.writeText(log)}
            className="ml-auto text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Copy log
          </button>
        </div>

        {/* Log content */}
        <div className="flex-1 overflow-y-auto font-mono text-xs p-4 bg-gray-950">
          {loading && <p className="text-gray-500">Loading logs...</p>}
          {error && <p className="text-red-400">{error}</p>}
          {!loading && !showAll && lines.length > 100 && (
            <p className="text-gray-600 mb-2 italic">... showing last 100 of {lines.length} lines ...</p>
          )}
          {displayLines.map((line, i) => {
            const isError = /error|failed|fatal|exception/i.test(line) && !/\[0m/.test(line);
            const isWarning = /warning|warn/i.test(line);
            return (
              <div key={i} className={`leading-5 whitespace-pre-wrap ${
                isError ? 'text-red-400' : isWarning ? 'text-yellow-400' : 'text-gray-300'
              }`}>
                {line || ' '}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
