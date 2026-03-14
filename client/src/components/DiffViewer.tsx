import React, { useState } from 'react';
import type { Diff } from '../types';

interface Props {
  diffs: Diff[];
}

function renderDiff(diff: string) {
  return diff.split('\n').map((line, i) => {
    let cls = 'text-gray-400';
    let bg = '';
    if (line.startsWith('+++') || line.startsWith('---')) {
      cls = 'text-gray-400 font-semibold';
    } else if (line.startsWith('+')) {
      cls = 'text-green-300';
      bg = 'bg-green-950';
    } else if (line.startsWith('-')) {
      cls = 'text-red-300';
      bg = 'bg-red-950';
    } else if (line.startsWith('@@')) {
      cls = 'text-blue-300';
      bg = 'bg-blue-950';
    }
    return (
      <div key={i} className={`${bg} px-2 py-0`}>
        <span className={`${cls} font-mono text-xs whitespace-pre`}>{line || ' '}</span>
      </div>
    );
  });
}

function FileLabel({ diff }: { diff: Diff }) {
  if (diff.new_file) return <span className="text-green-400 text-xs ml-2">[new]</span>;
  if (diff.deleted_file) return <span className="text-red-400 text-xs ml-2">[deleted]</span>;
  if (diff.renamed_file) return <span className="text-yellow-400 text-xs ml-2">[renamed from {diff.old_path}]</span>;
  return null;
}

export default function DiffViewer({ diffs }: Props) {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const toggle = (i: number) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  if (!diffs.length) return (
    <div className="p-4 text-gray-500 text-sm">No changes found.</div>
  );

  return (
    <div className="space-y-2">
      {diffs.map((diff, i) => (
        <div key={i} className="border border-gray-700 rounded overflow-hidden">
          <button
            onClick={() => toggle(i)}
            className="w-full flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-750 text-left"
          >
            <span className="text-gray-400 text-xs">
              {collapsed.has(i) ? '▶' : '▼'}
            </span>
            <span className="font-mono text-xs text-gray-200 truncate">{diff.new_path || diff.old_path}</span>
            <FileLabel diff={diff} />
          </button>
          {!collapsed.has(i) && (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              {diff.diff ? (
                renderDiff(diff.diff)
              ) : (
                <div className="p-3 text-gray-500 text-xs">Binary file or no diff available</div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
