import React, { useEffect, useState } from 'react';
import { apiFor } from '../api';
import type { Pipeline, Job } from '../types';
import BuildLogs from './BuildLogs';

interface Props {
  mrIid: number;
  projectId: number;
}

const statusIcon: Record<string, string> = {
  success: '✓',
  failed: '✗',
  running: '↻',
  pending: '○',
  canceled: '⊘',
  skipped: '⊖',
  created: '◌',
  manual: '▷',
};

const statusColor: Record<string, string> = {
  success: 'text-green-400 bg-green-950 border-green-800',
  failed: 'text-red-400 bg-red-950 border-red-800',
  running: 'text-blue-400 bg-blue-950 border-blue-800',
  pending: 'text-yellow-400 bg-yellow-950 border-yellow-800',
  canceled: 'text-gray-400 bg-gray-800 border-gray-700',
  skipped: 'text-gray-500 bg-gray-900 border-gray-800',
  created: 'text-gray-400 bg-gray-900 border-gray-800',
  manual: 'text-orange-400 bg-orange-950 border-orange-800',
};

const pipelineStatusBadge: Record<string, string> = {
  success: 'bg-green-500 text-white',
  failed: 'bg-red-500 text-white',
  running: 'bg-blue-500 text-white',
  pending: 'bg-yellow-500 text-black',
  canceled: 'bg-gray-600 text-white',
  skipped: 'bg-gray-700 text-white',
  manual: 'bg-orange-500 text-white',
};

export default function PipelineView({ mrIid, projectId }: Props) {
  const api = apiFor(projectId);
  const [data, setData] = useState<{ pipeline: Pipeline; jobs: Job[]; source: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const result = await api.getMRPipelineDetail(mrIid);
      setData(result);
    } catch {}
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.getMRPipelineDetail(mrIid);
      setData(result);
    } catch {
      setError('No pipeline found or failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [mrIid]);

  // Auto-refresh every 5s while any job is running, pending, or manual
  useEffect(() => {
    if (!data) return;
    const hasActiveJobs = data.jobs.some(j =>
      j.status === 'running' || j.status === 'pending' || j.status === 'manual'
    );
    if (!hasActiveJobs) return;
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [data]);

  const handlePlayJob = async (job: Job) => {
    setActionLoading(job.id);
    setActionError(null);
    try {
      await api.playJob(job.id, job._is_bridge);
      await refresh();
      setTimeout(() => refresh(), 2000);
      setTimeout(() => refresh(), 6000);
    } catch (e: any) {
      const msg = e.response?.data?.error || e.response?.data?.message || e.message || 'Failed to trigger job';
      const isUnplayable = typeof msg === 'string' && msg.toLowerCase().includes('unplayable');

      if (isUnplayable) {
        // Deployment approval gate — use the Deployments Approval API
        try {
          const blocked = await api.getBlockedDeployments();
          // Match by exact job id or job name in the deployable field
          const deployment = blocked.find((d: any) =>
            d.deployable?.id === job.id || d.deployable?.name === job.name
          );

          if (deployment) {
            await api.approveDeployment(deployment.id);
            await refresh();
            setTimeout(() => refresh(), 2000);
            setTimeout(() => refresh(), 6000);
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
      await refresh();
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
      await refresh();
    } catch (e: any) {
      const msg = e.response?.data?.error || e.response?.data?.message || e.message || 'Failed to cancel job';
      setActionError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelPipeline = async () => {
    if (!data) return;
    try {
      await api.cancelPipeline(data.pipeline.id);
      await refresh();
    } catch {}
  };

  const handleRetryPipeline = async () => {
    if (!data) return;
    try {
      await api.retryPipeline(data.pipeline.id);
      await refresh();
      setTimeout(() => refresh(), 2000);
    } catch {}
  };

  if (loading) return <div className="p-4 text-gray-500 text-sm">Loading pipeline...</div>;
  if (error) return <div className="p-4 text-gray-500 text-sm">{error}</div>;
  if (!data) return <div className="p-4 text-gray-500 text-sm">No pipeline for this MR.</div>;

  const { pipeline, jobs } = data;

  // Group jobs by stage
  const stages = [...new Set(jobs.map(j => j.stage))];
  const byStage = (stage: string) => jobs.filter(j => j.stage === stage);

  const failedJobs = jobs.filter(j => j.status === 'failed');
  const manualJobs = jobs.filter(j => j.status === 'manual');

  return (
    <div>
      {/* Action error banner */}
      {actionError && (
        <div className="mb-3 p-2.5 bg-yellow-950 border border-yellow-700 rounded flex items-start gap-2">
          <span className="text-yellow-400 text-xs shrink-0">⚠</span>
          <p className="text-yellow-300 text-xs flex-1">{actionError}</p>
          <button onClick={() => setActionError(null)} className="text-yellow-600 hover:text-yellow-400 text-xs shrink-0">✕</button>
        </div>
      )}
      {/* Pipeline summary */}
      <div className="flex items-center gap-3 p-3 bg-gray-800 rounded mb-4">
        <span className={`text-xs font-semibold px-2 py-1 rounded ${pipelineStatusBadge[pipeline.status] || 'bg-gray-700 text-white'}`}>
          {pipeline.status.toUpperCase()}
        </span>
        <span className="text-xs text-gray-400">Pipeline #{pipeline.id}</span>
        {pipeline.duration && (
          <span className="text-xs text-gray-500">{Math.round(pipeline.duration)}s</span>
        )}
        {data.source === 'target_branch' && (
          <span className="text-xs text-yellow-500 bg-yellow-950 px-2 py-0.5 rounded border border-yellow-800">
            Latest on {pipeline.ref}
          </span>
        )}
        {data.source === 'merge_commit' && (
          <span className="text-xs text-purple-400 bg-purple-950 px-2 py-0.5 rounded border border-purple-800">
            Post-merge pipeline
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {(pipeline.status === 'running' || pipeline.status === 'pending') && (
            <button
              onClick={handleCancelPipeline}
              className="text-xs bg-gray-700 hover:bg-red-800 text-white px-2 py-0.5 rounded"
            >
              ⊘ Cancel
            </button>
          )}
          {(pipeline.status === 'failed' || pipeline.status === 'canceled') && (
            <button
              onClick={handleRetryPipeline}
              className="text-xs bg-yellow-700 hover:bg-yellow-600 text-white px-2 py-0.5 rounded"
            >
              ↻ Retry Pipeline
            </button>
          )}
          <a
            href={pipeline.web_url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-orange-400 hover:underline"
          >
            Open in GitLab ↗
          </a>
        </div>
      </div>

      {/* Failed jobs banner */}
      {failedJobs.length > 0 && (
        <div className="mb-4 p-3 bg-red-950 border border-red-800 rounded">
          <p className="text-red-400 text-xs font-semibold mb-2">
            {failedJobs.length} job{failedJobs.length > 1 ? 's' : ''} failed
          </p>
          <div className="flex flex-wrap gap-2">
            {failedJobs.map(job => (
              <button
                key={job.id}
                onClick={() => setSelectedJob(job)}
                className="text-xs bg-red-800 hover:bg-red-700 text-red-200 px-2 py-1 rounded transition-colors"
              >
                View logs: {job.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Manual jobs banner */}
      {manualJobs.length > 0 && (
        <div className="mb-4 p-3 bg-orange-950 border border-orange-800 rounded">
          <p className="text-orange-400 text-xs font-semibold mb-2">
            {manualJobs.length} manual job{manualJobs.length > 1 ? 's' : ''} awaiting action
          </p>
          <div className="flex flex-wrap gap-2">
            {manualJobs.map(job => (
              <button
                key={job.id}
                onClick={() => handlePlayJob(job)}
                disabled={actionLoading === job.id}
                className="text-xs bg-orange-800 hover:bg-orange-700 text-orange-200 px-2 py-1 rounded transition-colors disabled:opacity-50"
              >
                {actionLoading === job.id ? '...' : '▶'} {job.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Build logs modal */}
      {selectedJob && (
        <BuildLogs job={selectedJob} projectId={projectId} onClose={() => setSelectedJob(null)} />
      )}

      {/* Stages */}
      <div className="space-y-3">
        {stages.map(stage => (
          <div key={stage}>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{stage}</p>
            <div className="space-y-1">
              {byStage(stage).map(job => (
                <div
                  key={job.id}
                  className={`flex items-center gap-2 p-2 rounded border text-xs ${statusColor[job.status] || 'text-gray-400 bg-gray-900 border-gray-800'}`}
                >
                  <span className="font-mono w-4 text-center">{statusIcon[job.status] || '?'}</span>
                  <span className="flex-1">{job.name}</span>
                  {job.duration && (
                    <span className="opacity-60">{Math.round(job.duration)}s</span>
                  )}
                  {job.allow_failure && job.status === 'failed' && (
                    <span className="text-xs opacity-60">(allowed)</span>
                  )}
                  {/* Cancel for running/pending jobs */}
                  {(job.status === 'running' || job.status === 'pending') && (
                    <button
                      onClick={() => handleCancelJob(job.id)}
                      disabled={actionLoading === job.id}
                      className="text-xs bg-gray-700 hover:bg-red-800 text-white px-2 py-0.5 rounded disabled:opacity-50"
                    >
                      {actionLoading === job.id ? '...' : '⊘ Cancel'}
                    </button>
                  )}
                  {/* Play button for manual jobs */}
                  {job.status === 'manual' && (
                    <button
                      onClick={() => handlePlayJob(job)}
                      disabled={actionLoading === job.id}
                      className="text-xs bg-orange-700 hover:bg-orange-600 text-white px-2 py-0.5 rounded disabled:opacity-50"
                    >
                      {actionLoading === job.id ? 'Running...' : '▶ Play'}
                    </button>
                  )}
                  {/* Retry button for failed jobs */}
                  {job.status === 'failed' && (
                    <>
                      <button
                        onClick={() => handleRetryJob(job.id)}
                        disabled={actionLoading === job.id}
                        className="text-xs bg-yellow-700 hover:bg-yellow-600 text-white px-2 py-0.5 rounded disabled:opacity-50"
                      >
                        {actionLoading === job.id ? '...' : '↻ Retry'}
                      </button>
                      {!job.allow_failure && (
                        <button
                          onClick={() => setSelectedJob(job)}
                          className="text-xs bg-red-700 hover:bg-red-600 text-white px-1.5 py-0.5 rounded"
                        >
                          Logs
                        </button>
                      )}
                    </>
                  )}
                  <a
                    href={job.web_url}
                    target="_blank"
                    rel="noreferrer"
                    className="opacity-50 hover:opacity-100"
                  >
                    ↗
                  </a>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={load}
        className="mt-4 text-xs text-gray-500 hover:text-gray-300 transition-colors"
      >
        ↺ Refresh
      </button>
    </div>
  );
}
