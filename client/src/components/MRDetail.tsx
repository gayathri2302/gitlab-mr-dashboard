import React, { useEffect, useState } from 'react';
import { apiFor } from '../api';
import type { MR, Diff, AwardEmoji, Discussion } from '../types';
import DiffViewer from './DiffViewer';
import PipelineView from './PipelineView';
import CommitsView from './CommitsView';
import EditMRModal from './EditMRModal';

function renderWithJiraLinks(text: string) {
  const parts = text.split(/(NGSB[-\s]\d+)/gi);
  return parts.map((part, i) =>
    /^NGSB[-\s]\d+$/i.test(part) ? (
      <a
        key={i}
        href={`https://jiraims.rm.imshealth.com/browse/${part.replace(/\s/, '-').toUpperCase()}`}
        target="_blank"
        rel="noreferrer"
        className="text-blue-400 hover:text-blue-300 hover:underline"
      >
        {part}
      </a>
    ) : part
  );
}

interface Props {
  mr: MR;
  projectId: number;
  onMutated: (updated?: MR) => void;
}

type Tab = 'details' | 'changes' | 'commits' | 'pipeline' | 'discussions';

const mergeStatusBadge: Record<string, string> = {
  mergeable: 'bg-green-500 text-white',
  not_open: 'bg-gray-600 text-white',
  unchecked: 'bg-yellow-600 text-black',
  checking: 'bg-blue-500 text-white',
  not_approved: 'bg-orange-500 text-white',
  blocked_status: 'bg-red-600 text-white',
  conflicts: 'bg-red-500 text-white',
};

const REACTION_EMOJIS = [
  { name: 'thumbsup',   label: '👍' },
  { name: 'thumbsdown', label: '👎' },
  { name: 'heart',      label: '❤️' },
  { name: 'tada',       label: '🎉' },
  { name: 'eyes',       label: '👀' },
  { name: 'fire',       label: '🔥' },
];

export default function MRDetail({ mr: initialMR, projectId, onMutated }: Props) {
  const api = apiFor(projectId);
  const [mr, setMr] = useState<MR>(initialMR);
  const [tab, setTab] = useState<Tab>('details');
  const [diffs, setDiffs] = useState<Diff[]>([]);
  const [diffsLoading, setDiffsLoading] = useState(false);
  const [commitCount, setCommitCount] = useState<number | null>(null);
  const [approvals, setApprovals] = useState<Array<{ id: number; name: string; username: string; avatar_url: string }>>([]);
  const [emojis, setEmojis] = useState<AwardEmoji[]>([]);
  const [emojiLoading, setEmojiLoading] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [closing, setClosing] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [sourcetreeMsg, setSourcetreeMsg] = useState('');
  const [showMergeConfirm, setShowMergeConfirm] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [discussionsLoading, setDiscussionsLoading] = useState(false);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  useEffect(() => {
    setMr(initialMR);
    setTab('details');
    setDiffs([]);
    setCommitCount(null);
    setApprovals([]);
    setEmojis([]);
    setDiscussions([]);
    setActionMsg(null);
    setSourcetreeMsg('');
    setShowMergeConfirm(false);
    setShowCloseConfirm(false);
    setShowEdit(false);
    setReplyText({});
    setReplyingTo(null);

    // Load approvals + emojis eagerly
    api.getMRApprovals(initialMR.iid)
      .then(d => setApprovals((d.approved_by || []).map((a: any) => a.user)))
      .catch(() => {});
    api.getEmojis(initialMR.iid).then(setEmojis).catch(() => {});
    // Pre-fetch commit count for tab badge
    api.getMRCommits(initialMR.iid).then(c => setCommitCount(c.length)).catch(() => {});
  }, [initialMR.iid, projectId]);

  // Auto-refresh merge status when it's unchecked — keep polling every 3s until resolved
  useEffect(() => {
    if (mr.detailed_merge_status !== 'unchecked') return;

    let attempts = 0;
    const MAX_ATTEMPTS = 10;
    setRefreshingStatus(true);

    const poll = async () => {
      attempts++;
      try {
        const updated = await api.getMR(mr.iid);
        if (updated.detailed_merge_status !== 'unchecked') {
          setMr(updated);
          flash(`Merge status: ${updated.detailed_merge_status.replace(/_/g, ' ')}`);
          onMutated(updated);
          setRefreshingStatus(false);
          return; // resolved — stop polling
        }
        // Still unchecked
        setMr(updated);
        if (attempts < MAX_ATTEMPTS) {
          timer = window.setTimeout(poll, 3000);
        } else {
          setRefreshingStatus(false);
        }
      } catch (e: any) {
        console.error('Failed to refresh merge status:', e);
        setRefreshingStatus(false);
      }
    };

    let timer = window.setTimeout(poll, 1500);
    return () => {
      clearTimeout(timer);
      setRefreshingStatus(false);
    };
  }, [mr.iid, mr.detailed_merge_status === 'unchecked']);

  const flash = (text: string, ok = true) => {
    setActionMsg({ text, ok });
    setTimeout(() => setActionMsg(null), 4000);
  };

  const loadDiffs = async () => {
    if (diffs.length) return;
    setDiffsLoading(true);
    try { setDiffs(await api.getMRChanges(mr.iid)); }
    finally { setDiffsLoading(false); }
  };

  const loadDiscussions = async () => {
    if (discussions.length && !discussionsLoading) return;
    setDiscussionsLoading(true);
    try { setDiscussions(await api.getMRDiscussions(mr.iid)); }
    catch (e: any) { flash(e.message, false); }
    finally { setDiscussionsLoading(false); }
  };

  const handleReplyToDiscussion = async (discussionId: string) => {
    const body = replyText[discussionId];
    if (!body || !body.trim()) return;
    setReplyingTo(discussionId);
    try {
      await api.replyToDiscussion(mr.iid, discussionId, body);
      setReplyText(prev => ({ ...prev, [discussionId]: '' }));
      flash('Reply posted successfully');
      await loadDiscussions();
    } catch (e: any) {
      flash(e.response?.data?.error || e.message, false);
    } finally { setReplyingTo(null); }
  };

  const handleResolveDiscussion = async (discussionId: string, resolved: boolean) => {
    setReplyingTo(discussionId);
    try {
      await api.resolveDiscussion(mr.iid, discussionId, !resolved);
      flash(`Discussion ${!resolved ? 'resolved' : 'unresolved'}`);
      await loadDiscussions();
    } catch (e: any) {
      flash(e.response?.data?.error || e.message, false);
    } finally { setReplyingTo(null); }
  };

  const handleMerge = async () => {
    setMerging(true);
    try {
      const updated = await api.mergeMR(mr.iid);
      setMr(updated);
      setShowMergeConfirm(false);
      flash(`MR !${mr.iid} merged successfully`);
      onMutated(updated);
    } catch (e: any) {
      flash(e.response?.data?.error || e.message, false);
    } finally { setMerging(false); }
  };

  const handleClose = async () => {
    setClosing(true);
    try {
      const updated = await api.closeMR(mr.iid);
      setMr(updated);
      setShowCloseConfirm(false);
      flash(`MR !${mr.iid} closed`);
      onMutated(updated);
    } catch (e: any) {
      flash(e.response?.data?.error || e.message, false);
    } finally { setClosing(false); }
  };

  const handleReopen = async () => {
    try {
      const updated = await api.reopenMR(mr.iid);
      setMr(updated);
      flash(`MR !${mr.iid} reopened`);
      onMutated(updated);
    } catch (e: any) { flash(e.message, false); }
  };

  const handleDraftToggle = async () => {
    setDrafting(true);
    try {
      const updated = await api.setDraft(mr.iid, !mr.draft);
      setMr(updated);
      flash(`MR marked as ${updated.draft ? 'Draft' : 'Ready'}`);
      onMutated(updated);
    } catch (e: any) {
      flash(e.response?.data?.error || e.message, false);
    } finally { setDrafting(false); }
  };

  const handleApprove = async () => {
    setApproving(true);
    try {
      const updated = await api.approveMR(mr.iid);
      setMr(updated);
      // Refresh approvals
      api.getMRApprovals(mr.iid)
        .then(d => setApprovals((d.approved_by || []).map((a: any) => a.user)))
        .catch(() => {});
      flash(`✓ MR !${mr.iid} approved`);
      onMutated(updated);
    } catch (e: any) {
      flash(e.response?.data?.error || e.message, false);
    } finally { setApproving(false); }
  };

  const handleUnapprove = async () => {
    setApproving(true);
    try {
      const updated = await api.unapproveMR(mr.iid);
      setMr(updated);
      // Refresh approvals
      api.getMRApprovals(mr.iid)
        .then(d => setApprovals((d.approved_by || []).map((a: any) => a.user)))
        .catch(() => {});
      flash(`✗ MR !${mr.iid} unapproved`);
      onMutated(updated);
    } catch (e: any) {
      flash(e.response?.data?.error || e.message, false);
    } finally { setApproving(false); }
  };

  const handleOpenSourceTree = async () => {
    setSourcetreeMsg('Opening SourceTree...');
    try {
      const r = await api.openInSourceTree(mr.iid);
      setSourcetreeMsg(r.message);
    } catch (e: any) {
      setSourcetreeMsg(e.response?.data?.error || 'Failed');
    }
  };

  // ── Emoji reactions ───────────────────────────────────────────────────────

  const grouped = REACTION_EMOJIS.map(r => {
    const matches = emojis.filter(e => e.name === r.name);
    const mine = matches.find(e => e.is_mine);
    return { ...r, count: matches.length, mine, awardId: mine?.id };
  });

  const handleEmoji = async (name: string, mine?: AwardEmoji) => {
    if (emojiLoading) return;
    setEmojiLoading(name);
    try {
      if (mine) {
        await api.removeEmoji(mr.iid, mine.id);
        setEmojis(prev => prev.filter(e => e.id !== mine.id));
      } else {
        const added = await api.addEmoji(mr.iid, name);
        setEmojis(prev => [...prev, added]);
      }
    } catch { /* ignore */ }
    finally { setEmojiLoading(null); }
  };

  // Allow merge unless the MR is a draft or has conflicts; unchecked is not a blocker
  const canMerge = mr.state === 'opened' && !mr.draft && !mr.has_conflicts &&
    mr.detailed_merge_status !== 'not_open' && mr.detailed_merge_status !== 'blocked_status' &&
    mr.detailed_merge_status !== 'conflicts' && mr.detailed_merge_status !== 'not_approved';
  const stateColor = mr.state === 'merged' ? 'text-purple-400' : mr.state === 'opened' ? 'text-green-400' : 'text-red-400';

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-800 shrink-0">
        <div className="flex items-start gap-2 mb-1">
          <span className="text-orange-400 font-mono text-sm font-bold shrink-0">!{mr.iid}</span>
          <span className={`text-xs font-semibold mt-0.5 ${stateColor}`}>{mr.state.toUpperCase()}</span>
          {mr.draft && <span className="text-xs bg-purple-800 text-purple-300 px-1.5 py-0.5 rounded">DRAFT</span>}
          {mr.has_conflicts && <span className="text-xs bg-red-800 text-red-300 px-1.5 py-0.5 rounded">CONFLICTS</span>}
        </div>

        <h2 className="text-gray-100 text-sm font-medium leading-snug mb-2">{renderWithJiraLinks(mr.title)}</h2>

        {/* Branch */}
        <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
          <span className="font-mono bg-gray-800 px-1.5 py-0.5 rounded text-gray-300">{mr.source_branch}</span>
          <span>→</span>
          <span className="font-mono bg-gray-800 px-1.5 py-0.5 rounded text-gray-300">{mr.target_branch}</span>
          {mr.changes_count && <span className="text-gray-600">· {mr.changes_count} files</span>}
        </div>

        {/* Meta */}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500 mb-3">
          <span>By <span className="text-gray-300">{mr.author.name}</span></span>
          <span>Updated <span className="text-gray-300">{new Date(mr.updated_at).toLocaleString()}</span></span>
          {mr.merged_at && <span>Merged <span className="text-gray-300">{new Date(mr.merged_at).toLocaleString()}</span></span>}
        </div>

        {/* Approvals */}
        {approvals.length > 0 && (
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-gray-500">Approved by:</span>
            {approvals.map(u => (
              <div key={u.id} className="flex items-center gap-1 bg-green-900 border border-green-700 rounded-full px-2 py-0.5">
                {u.avatar_url && (
                  <img src={u.avatar_url} alt={u.name} className="w-4 h-4 rounded-full" />
                )}
                <span className="text-xs text-green-300">{u.name}</span>
                <span className="text-green-500 text-xs">✓</span>
              </div>
            ))}
          </div>
        )}

        {/* Reactions */}
        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
          {grouped.map(r => (
            <button
              key={r.name}
              onClick={() => handleEmoji(r.name, r.mine)}
              disabled={emojiLoading === r.name}
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-all ${
                r.mine
                  ? 'bg-orange-900 border-orange-600 text-orange-300'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
              } ${emojiLoading === r.name ? 'opacity-50' : ''}`}
            >
              <span>{r.label}</span>
              {r.count > 0 && <span>{r.count}</span>}
            </button>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          {/* Edit */}
          <button
            onClick={() => setShowEdit(true)}
            className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 px-3 py-1.5 rounded flex items-center gap-1.5"
          >
            ✏ Edit
          </button>

          {/* SourceTree */}
          <button
            onClick={handleOpenSourceTree}
            className="text-xs bg-blue-800 hover:bg-blue-700 text-blue-200 px-3 py-1.5 rounded flex items-center gap-1.5"
          >
            ⎇ SourceTree
          </button>

          {/* Merge */}
          {mr.state === 'opened' && (
            <button
              onClick={() => setShowMergeConfirm(true)}
              disabled={!canMerge}
              className={`text-xs px-3 py-1.5 rounded ${
                canMerge
                  ? 'bg-green-700 hover:bg-green-600 text-white'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
            >
              ⤵ Merge
            </button>
          )}

          {/* Draft toggle */}
          {mr.state === 'opened' && (
            <button
              onClick={handleDraftToggle}
              disabled={drafting}
              className="text-xs bg-purple-800 hover:bg-purple-700 disabled:opacity-50 text-purple-200 px-3 py-1.5 rounded"
            >
              {drafting ? '...' : mr.draft ? '✓ Mark Ready' : '⋯ Mark Draft'}
            </button>
          )}

          {/* Approve toggle */}
          {mr.state === 'opened' && (
            <button
              onClick={() => approvals.length > 0 ? handleUnapprove() : handleApprove()}
              disabled={approving}
              className={`text-xs px-3 py-1.5 rounded disabled:opacity-50 ${
                approvals.length > 0
                  ? 'bg-blue-800 hover:bg-blue-700 text-blue-200'
                  : 'bg-green-800 hover:bg-green-700 text-green-200'
              }`}
            >
              {approving ? '...' : approvals.length > 0 ? '✓ Approved' : '✓ Approve'}
            </button>
          )}

          {/* Close / Reopen */}
          {mr.state === 'opened' && (
            <button
              onClick={() => setShowCloseConfirm(true)}
              className="text-xs bg-red-900 hover:bg-red-800 text-red-300 px-3 py-1.5 rounded"
            >
              ✕ Close MR
            </button>
          )}
          {mr.state === 'closed' && (
            <button
              onClick={handleReopen}
              className="text-xs bg-green-800 hover:bg-green-700 text-green-200 px-3 py-1.5 rounded"
            >
              ↺ Reopen
            </button>
          )}

          {/* GitLab link */}
          <a
            href={mr.web_url}
            target="_blank"
            rel="noreferrer"
            className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 px-3 py-1.5 rounded"
          >
            GitLab ↗
          </a>
        </div>

        {/* SourceTree feedback */}
        {sourcetreeMsg && (
          <div className="mt-2 text-xs px-3 py-1.5 rounded bg-blue-950 text-blue-400">{sourcetreeMsg}</div>
        )}
        {actionMsg && (
          <div className={`mt-2 text-xs px-3 py-1.5 rounded ${actionMsg.ok ? 'bg-green-950 text-green-400' : 'bg-red-950 text-red-400'}`}>
            {actionMsg.text}
          </div>
        )}
      </div>

      {/* ── Confirm dialogs ─────────────────────────────────────────────── */}

      {showMergeConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-5 max-w-sm w-full">
            <h3 className="text-gray-100 font-semibold mb-2">Confirm Merge</h3>
            <p className="text-gray-400 text-sm mb-1">
              Merge <span className="text-orange-400 font-mono">!{mr.iid}</span> into{' '}
              <span className="font-mono text-gray-300">{mr.target_branch}</span>?
            </p>
            <p className="text-gray-500 text-xs mb-4">{mr.title}</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowMergeConfirm(false)} className="text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded">Cancel</button>
              <button onClick={handleMerge} disabled={merging} className="text-xs px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded">
                {merging ? 'Merging...' : 'Confirm Merge'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCloseConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-5 max-w-sm w-full">
            <h3 className="text-gray-100 font-semibold mb-2">Close Merge Request?</h3>
            <p className="text-gray-400 text-sm mb-4">
              This will close <span className="text-orange-400 font-mono">!{mr.iid}</span> without merging. You can reopen it later.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowCloseConfirm(false)} className="text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded">Cancel</button>
              <button onClick={handleClose} disabled={closing} className="text-xs px-3 py-1.5 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white rounded">
                {closing ? 'Closing...' : 'Close MR'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-800 shrink-0">
        {(['details', 'changes', 'commits', 'pipeline', 'discussions'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              if (t === 'changes') loadDiffs();
              if (t === 'discussions') loadDiscussions();
            }}
            className={`px-4 py-2 text-xs font-medium capitalize transition-colors ${
              tab === t ? 'text-orange-400 border-b-2 border-orange-400' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {t}
            {t === 'changes' && (diffs.length > 0 || mr.changes_count) && (
              <span className="ml-1.5 bg-gray-700 text-gray-400 text-xs px-1.5 py-0.5 rounded-full">
                {diffs.length > 0 ? diffs.length : mr.changes_count}
              </span>
            )}
            {t === 'commits' && commitCount !== null && (
              <span className="ml-1.5 bg-gray-700 text-gray-400 text-xs px-1.5 py-0.5 rounded-full">{commitCount}</span>
            )}
            {t === 'discussions' && discussions.length > 0 && (
              <span className="ml-1.5 bg-gray-700 text-gray-400 text-xs px-1.5 py-0.5 rounded-full">{discussions.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Edit MR modal */}
      {showEdit && (
        <EditMRModal
          mr={mr}
          projectId={projectId}
          onClose={() => setShowEdit(false)}
          onSaved={updated => {
            setMr(updated);
            setShowEdit(false);
            flash('MR updated');
            onMutated(updated);
          }}
        />
      )}

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'details' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Description</h3>
              {mr.description
                ? <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{mr.description}</p>
                : <p className="text-sm text-gray-600 italic">No description.</p>
              }
            </div>
            <div>
              <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Merge Status</h3>
              <span className={`text-xs px-2 py-1 rounded font-medium ${mergeStatusBadge[mr.detailed_merge_status] || 'bg-gray-700 text-gray-300'}`}>
                {mr.detailed_merge_status.replace(/_/g, ' ')}
              </span>
            </div>
          </div>
        )}
        {tab === 'changes' && (
          diffsLoading ? <div className="text-gray-500 text-sm">Loading diffs...</div> : <DiffViewer diffs={diffs} />
        )}
        {tab === 'commits' && (
          <CommitsView mrIid={mr.iid} projectId={projectId} loadCommits={() => api.getMRCommits(mr.iid)} onCountLoaded={setCommitCount} />
        )}
        {tab === 'pipeline' && (
          <PipelineView mrIid={mr.iid} projectId={projectId} />
        )}
        {tab === 'discussions' && (
          <div className="p-4 overflow-y-auto flex-1">
            {discussionsLoading ? (
              <div className="text-gray-500 text-sm">Loading discussions...</div>
            ) : discussions.length === 0 ? (
              <div className="text-gray-600 text-sm italic">No discussions yet.</div>
            ) : (
              <div className="space-y-4">
                {discussions.map(discussion => (
                  <div key={discussion.id} className={`border rounded-lg p-3 ${discussion.resolved ? 'border-green-800 bg-green-900 bg-opacity-20' : 'border-gray-700 bg-gray-800 bg-opacity-30'}`}>
                    {/* Discussion thread */}
                    <div className="space-y-3">
                      {discussion.notes.map((note, idx) => (
                        <div key={note.id} className={`${idx > 0 ? 'ml-4 border-l border-gray-700 pl-3' : ''}`}>
                          <div className="flex items-center gap-2 mb-1">
                            <img src={note.author.avatar_url} alt={note.author.name} className="w-5 h-5 rounded-full" />
                            <span className="text-xs font-semibold text-gray-300">{note.author.name}</span>
                            <span className="text-xs text-gray-500">@{note.author.username}</span>
                            <span className="text-xs text-gray-600">
                              {new Date(note.created_at).toLocaleDateString()} {new Date(note.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-sm text-gray-300 whitespace-pre-wrap">{note.body}</p>
                        </div>
                      ))}
                    </div>

                    {/* Reply input */}
                    {!discussion.resolved && (
                      <div className="mt-3 pt-3 border-t border-gray-700">
                        <textarea
                          value={replyText[discussion.id] || ''}
                          onChange={(e) => setReplyText(prev => ({ ...prev, [discussion.id]: e.target.value }))}
                          placeholder="Reply to discussion..."
                          rows={2}
                          className="w-full bg-gray-700 text-gray-100 text-xs px-2 py-1 rounded border border-gray-600 focus:border-orange-500 focus:outline-none"
                        />
                        <div className="flex gap-2 mt-2 justify-between">
                          <button
                            onClick={() => handleReplyToDiscussion(discussion.id)}
                            disabled={!replyText[discussion.id]?.trim() || replyingTo === discussion.id}
                            className="text-xs bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-blue-100 px-2 py-1 rounded"
                          >
                            {replyingTo === discussion.id ? 'Posting...' : 'Reply'}
                          </button>
                          {discussion.resolvable && (
                            <button
                              onClick={() => handleResolveDiscussion(discussion.id, discussion.resolved)}
                              disabled={replyingTo === discussion.id}
                              className="text-xs bg-green-700 hover:bg-green-600 disabled:opacity-50 text-green-100 px-2 py-1 rounded"
                            >
                              {replyingTo === discussion.id ? 'Processing...' : 'Mark as Resolved'}
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Resolved indicator */}
                    {discussion.resolved && (
                      <div className="mt-3 pt-3 border-t border-green-700 flex items-center justify-between">
                        <span className="text-xs text-green-300 font-semibold">✓ Resolved</span>
                        {discussion.resolved_by && (
                          <span className="text-xs text-gray-400">
                            by {discussion.resolved_by.name} on {new Date(discussion.resolved_at || '').toLocaleDateString()}
                          </span>
                        )}
                        <button
                          onClick={() => handleResolveDiscussion(discussion.id, discussion.resolved)}
                          disabled={replyingTo === discussion.id}
                          className="text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-300 px-2 py-1 rounded"
                        >
                          {replyingTo === discussion.id ? 'Processing...' : 'Re-open'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
