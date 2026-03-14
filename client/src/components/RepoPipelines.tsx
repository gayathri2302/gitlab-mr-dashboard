import React, { useEffect, useState } from 'react';
import { apiFor } from '../api';
import type { Pipeline, Job } from '../types';
import BuildLogs from './BuildLogs';

interface Props {
  projectId: number;
}

const statusColor: Record<string, string> = {
  success:  'text-green-400  bg-green-950  border-green-800',
  failed:   'text-red-400    bg-red-950    border-red-800',
  running:  'text-blue-400   bg-blue-950   border-blue-800',
  pending:  'text-yellow-400 bg-yellow-950 border-yellow-800',
  canceled: 'text-gray-400   bg-gray-800   border-gray-700',
  skipped:  'text-gray-500   bg-gray-800   border-gray-700',
  manual:   'text-gray-400   bg-gray-800   border-gray-700',
};

const statusIcon: Record<string, string> = {
  success:  '✓',
  failed:   '✗',
  running:  '↻',
  pending:  '○',
  canceled: '⊘',
  skipped:  '⊖',
  manual:   '▷',
  created:  '◌',
};

const jobStatusColor: Record<string, string> = {
  success:  'text-green-400 bg-green-950 border-green-800',
  failed:   'text-red-400 bg-red-950 border-red-800',
  running:  'text-blue-400 bg-blue-950 border-blue-800',
  pending:  'text-yellow-400 bg-yellow-950 border-yellow-800',
  canceled: 'text-gray-400 bg-gray-800 border-gray-700',
  skipped:  'text-gray-500 bg-gray-900 border-gray-800',
  created:  'text-gray-400 bg-gray-900 border-gray-800',
  manual:   'text-gray-400 bg-gray-800 border-gray-700',
};

function PipelineJobs({
  pipelineId,
  projectId,
}: {
  pipelineId: number;
  projectId: number;
}) {
  const api = apiFor(projectId);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Silent refresh — no loading flash
  const refreshJobs = () => {
    api.getPipelineJobs(pipelineId).then(setJobs).catch(() => {});
  };

  const loadJobs = () => {
    setInitialLoading(true);
    api.getPipelineJobs(pipelineId)
      .then(setJobs)
      .catch(() => setJobs([]))
      .finally(() => setInitialLoading(false));
  };

  useEffect(() => { loadJobs(); }, [pipelineId]);

  // Auto-refresh every 5s while any job is running, pending, or manual
  useEffect(() => {
    const hasActiveJobs = jobs.some(j =>
      j.status === 'running' || j.status === 'pending' || j.status === 'manual'
    );
    if (!hasActiveJobs) return;
    const t = setInterval(refreshJobs, 5000);
    return () => clearInterval(t);
  }, [jobs]);

  const handlePlayJob = async (job: Job) => {
    setActionLoading(job.id);
    setActionError(null);
    try {
      await api.playJob(job.id, job._is_bridge);
      refreshJobs();
    } catch (e: any) {
      const msg = e.response?.data?.error || e.response?.data?.message || e.message || 'Failed to trigger job';
      const isUnplayable = typeof msg === 'string' && msg.toLowerCase().includes('unplayable');

      if (isUnplayable) {
        // Deployment approval gate — use the Deployments Approval API
        try {
          const blocked = await api.getBlockedDeployments();
          const deployment = blocked.find((d: any) =>
            d.deployable?.id === job.id || d.deployable?.name === job.name
          );

          if (deployment) {
            await api.approveDeployment(deployment.id);
            refreshJobs();
          } else {
            setActionError(`${job.name}: No blocked deployment found. It may already be approved or not yet created.`);
          }
        } catch (approvalErr: any) {
          const approvalMsg = approvalErr.response?.data?.error || approvalErr.response?.data?.message || approvalErr.message;
          setActionError(`${job.name}: Deployment approval failed — ${approvalMsg}`);
        }
      } else {
        setActionError(`${job.name}: ${msg}`);
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleRetryJob = async (jobId: number) => {
    setActionLoading(jobId);
    setActionError(null);
    try {
      await api.retryJob(jobId);
      refreshJobs();
    } catch (e: any) {
      const msg = e.response?.data?.error || e.message || 'Failed to retry job';
      setActionError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelJob = async (jobId: number) => {
    setActionLoading(jobId);
    setActionError(null);
    try {
      await api.cancelJob(jobId);
      refreshJobs();
    } catch (e: any) {
      const msg = e.response?.data?.error || e.response?.data?.message || e.message || 'Failed to cancel job';
      setActionError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setActionLoading(null);
    }
  };

  if (initialLoading) return <div className="px-4 pb-3 text-xs text-gray-500">Loading jobs...</div>;
  if (!jobs.length) return <div className="px-4 pb-3 text-xs text-gray-600">No jobs found</div>;

  const stages = [...new Set(jobs.map(j => j.stage))];
  const byStage = (stage: string) => jobs.filter(j => j.stage === stage);
  const failedJobs = jobs.filter(j => j.status === 'failed' && !j.allow_failure);
  const manualJobs = jobs.filter(j => j.status === 'manual');

  return (
    <div className="px-4 pb-4 space-y-3 border-t border-gray-800 pt-3">
      {/* Action error banner */}
      {actionError && (
        <div className="p-2.5 bg-yellow-950 border border-yellow-700 rounded flex items-start gap-2">
          <span className="text-yellow-400 text-xs shrink-0">⚠</span>
          <p className="text-yellow-300 text-xs flex-1">{actionError}</p>
          <button onClick={() => setActionError(null)} className="text-yellow-600 hover:text-yellow-400 text-xs shrink-0">✕</button>
        </div>
      )}
      {/* Failed jobs banner */}
      {failedJobs.length > 0 && (
        <div className="p-2.5 bg-red-950 border border-red-800 rounded">
          <p className="text-red-400 text-xs font-semibold mb-2">
            {failedJobs.length} job{failedJobs.length > 1 ? 's' : ''} failed
          </p>
          <div className="flex flex-wrap gap-2">
            {failedJobs.map(job => (
              <button
                key={job.id}
                onClick={() => setSelectedJob(job)}
                className="text-xs bg-red-800 hover:bg-red-700 text-red-200 px-2 py-1 rounded"
              >
                View logs: {job.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Manual jobs banner */}
      {manualJobs.length > 0 && (
        <div className="p-2.5 bg-orange-950 border border-orange-800 rounded">
          <p className="text-orange-400 text-xs font-semibold mb-2">
            {manualJobs.length} manual job{manualJobs.length > 1 ? 's' : ''} awaiting action
          </p>
          <div className="flex flex-wrap gap-2">
            {manualJobs.map(job => (
              <button
                key={job.id}
                onClick={() => handlePlayJob(job)}
                disabled={actionLoading === job.id}
                className="text-xs bg-orange-800 hover:bg-orange-700 text-orange-200 px-2 py-1 rounded disabled:opacity-50"
              >
                {actionLoading === job.id ? '...' : '▶'} {job.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stages */}
      {stages.map(stage => (
        <div key={stage}>
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1.5 font-semibold">{stage}</p>
          <div className="space-y-1">
            {byStage(stage).map(job => (
              <div
                key={job.id}
                className={`flex items-center gap-2 px-3 py-2 rounded border text-xs ${jobStatusColor[job.status] || 'text-gray-400 bg-gray-900 border-gray-800'}`}
              >
                <span className="font-mono w-4 text-center shrink-0">{statusIcon[job.status] || '?'}</span>
                <span className="flex-1 truncate">{job.name}</span>
                {job.duration && (
                  <span className="opacity-60 shrink-0">{Math.round(job.duration)}s</span>
                )}
                {job.allow_failure && job.status === 'failed' && (
                  <span className="text-xs opacity-60 shrink-0">(allowed)</span>
                )}
                {/* Play button for manual jobs only */}
                {job.status === 'manual' && (
                  <button
                    onClick={() => handlePlayJob(job)}
                    disabled={actionLoading === job.id}
                    className="text-xs bg-orange-700 hover:bg-orange-600 text-white px-2 py-0.5 rounded shrink-0 disabled:opacity-50"
                  >
                    {actionLoading === job.id ? 'Running...' : '▶ Play'}
                  </button>
                )}
                {/* Cancel for running/pending jobs */}
                {(job.status === 'running' || job.status === 'pending') && (
                  <button
                    onClick={() => handleCancelJob(job.id)}
                    disabled={actionLoading === job.id}
                    className="text-xs bg-gray-700 hover:bg-red-800 text-white px-2 py-0.5 rounded shrink-0 disabled:opacity-50"
                  >
                    {actionLoading === job.id ? '...' : '⊘ Cancel'}
                  </button>
                )}
                {/* Retry + Logs for failed jobs */}
                {job.status === 'failed' && (
                  <button
                    onClick={() => handleRetryJob(job.id)}
                    disabled={actionLoading === job.id}
                    className="text-xs bg-yellow-700 hover:bg-yellow-600 text-white px-2 py-0.5 rounded shrink-0 disabled:opacity-50"
                  >
                    {actionLoading === job.id ? '...' : '↻ Retry'}
                  </button>
                )}
                {job.status === 'failed' && !job.allow_failure && (
                  <button
                    onClick={() => setSelectedJob(job)}
                    className="text-xs bg-red-700 hover:bg-red-600 text-white px-1.5 py-0.5 rounded shrink-0"
                  >
                    Logs
                  </button>
                )}
                <a
                  href={job.web_url}
                  target="_blank"
                  rel="noreferrer"
                  className="opacity-40 hover:opacity-100 shrink-0"
                >
                  ↗
                </a>
              </div>
            ))}
          </div>
        </div>
      ))}

      {selectedJob && (
        <BuildLogs job={selectedJob} projectId={projectId} onClose={() => setSelectedJob(null)} />
      )}
    </div>
  );
}

export default function RepoPipelines({ projectId }: Props) {
  const api = apiFor(projectId);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [pipelineAction, setPipelineAction] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    setError('');
    setExpanded(null);
    api.listPipelines()
      .then(setPipelines)
      .catch((e: any) => setError(e.response?.data?.error || e.message || 'Failed to load pipelines'))
      .finally(() => setLoading(false));
  };

  const silentRefresh = () => {
    api.listPipelines().then(setPipelines).catch(() => {});
  };

  const handleCancelPipeline = async (pipelineId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setPipelineAction(pipelineId);
    try {
      await api.cancelPipeline(pipelineId);
      silentRefresh();
    } catch {} finally {
      setPipelineAction(null);
    }
  };

  const handleRetryPipeline = async (pipelineId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setPipelineAction(pipelineId);
    try {
      await api.retryPipeline(pipelineId);
      silentRefresh();
    } catch {} finally {
      setPipelineAction(null);
    }
  };

  useEffect(() => { load(); }, [projectId]);

  if (loading) return (
    <div className="flex items-center justify-center h-full text-gray-500 text-sm">Loading pipelines...</div>
  );
  if (error) return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <div className="text-red-400 text-sm text-center px-4">{error}</div>
      <button onClick={load} className="text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded">
        Retry
      </button>
    </div>
  );

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-gray-200 text-sm font-semibold">Recent Pipelines</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-600">{pipelines.length} pipelines</span>
          <button onClick={load} className="text-xs text-gray-600 hover:text-gray-300">↺ Refresh</button>
        </div>
      </div>

      <div className="space-y-2">
        {pipelines.map(p => {
          const cls = statusColor[p.status] || 'text-gray-400 bg-gray-800 border-gray-700';
          const icon = statusIcon[p.status] || '?';
          const duration = p.duration ? `${Math.round(p.duration)}s` : null;
          const date = new Date(p.updated_at).toLocaleString();
          const isOpen = expanded === p.id;

          return (
            <div
              key={p.id}
              className={`bg-gray-900 border rounded-lg overflow-hidden transition-colors ${
                isOpen ? 'border-gray-600' : 'border-gray-800 hover:border-gray-700'
              }`}
            >
              {/* Pipeline row — click to expand */}
              <button
                className="w-full flex items-center gap-3 px-4 py-3 text-left"
                onClick={() => setExpanded(isOpen ? null : p.id)}
              >
                {/* Status badge */}
                <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${cls} shrink-0 w-22 text-center`}>
                  {icon} {p.status}
                </span>

                {/* Pipeline ID */}
                <span className="text-orange-400 font-mono text-xs shrink-0">#{p.id}</span>

                {/* Ref (branch) */}
                <span className="text-xs font-mono bg-gray-800 text-gray-300 px-1.5 py-0.5 rounded truncate max-w-[160px]">
                  {p.ref}
                </span>

                {/* Duration */}
                {duration && (
                  <span className="text-xs text-gray-600 shrink-0">{duration}</span>
                )}

                {/* Date */}
                <span className="text-xs text-gray-600 ml-auto shrink-0">{date}</span>

                {/* Cancel for active pipelines */}
                {(p.status === 'running' || p.status === 'pending') && (
                  <button
                    onClick={(e) => handleCancelPipeline(p.id, e)}
                    disabled={pipelineAction === p.id}
                    className="text-xs bg-gray-700 hover:bg-red-800 text-white px-2 py-0.5 rounded shrink-0 disabled:opacity-50"
                  >
                    {pipelineAction === p.id ? '...' : '⊘ Cancel'}
                  </button>
                )}

                {/* Retry for failed/canceled pipelines */}
                {(p.status === 'failed' || p.status === 'canceled') && (
                  <button
                    onClick={(e) => handleRetryPipeline(p.id, e)}
                    disabled={pipelineAction === p.id}
                    className="text-xs bg-yellow-700 hover:bg-yellow-600 text-white px-2 py-0.5 rounded shrink-0 disabled:opacity-50"
                  >
                    {pipelineAction === p.id ? '...' : '↻ Retry'}
                  </button>
                )}

                {/* Expand indicator */}
                <span className="text-gray-600 text-xs shrink-0 ml-1">{isOpen ? '▲' : '▼'}</span>

                {/* GitLab link */}
                <a
                  href={p.web_url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="text-xs text-gray-500 hover:text-gray-300 shrink-0"
                  title="Open in GitLab"
                >
                  ↗
                </a>
              </button>

              {/* Expanded job detail */}
              {isOpen && (
                <PipelineJobs pipelineId={p.id} projectId={projectId} />
              )}
            </div>
          );
        })}

        {pipelines.length === 0 && (
          <div className="text-center text-gray-600 text-sm py-12">No pipelines found</div>
        )}
      </div>
    </div>
  );
}
