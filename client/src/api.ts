import axios from 'axios';
import type { MR, Diff, Commit, Pipeline, Job, AwardEmoji } from './types';

const http = axios.create({ baseURL: '/api' });

export function apiFor(projectId: number) {
  const p = projectId;
  return {
    listMRs: (state = 'opened') =>
      http.get<MR[]>(`/${p}/mrs`, { params: { state } }).then(r => r.data),

    getMR: (iid: number) =>
      http.get<MR>(`/${p}/mrs/${iid}`).then(r => r.data),

    getMRChanges: (iid: number) =>
      http.get<Diff[]>(`/${p}/mrs/${iid}/changes`).then(r => r.data),

    getMRCommits: (iid: number) =>
      http.get<Commit[]>(`/${p}/mrs/${iid}/commits`).then(r => r.data),

    getMRApprovals: (iid: number) =>
      http.get<{ approved_by: Array<{ user: { id: number; name: string; username: string; avatar_url: string } }> }>(`/${p}/mrs/${iid}/approvals`).then(r => r.data),

    mergeMR: (iid: number, commitMessage?: string) =>
      http.post<MR>(`/${p}/mrs/${iid}/merge`, { commitMessage }).then(r => r.data),

    closeMR: (iid: number) =>
      http.post<MR>(`/${p}/mrs/${iid}/close`).then(r => r.data),

    reopenMR: (iid: number) =>
      http.post<MR>(`/${p}/mrs/${iid}/reopen`).then(r => r.data),

    setDraft: (iid: number, draft: boolean) =>
      http.post<MR>(`/${p}/mrs/${iid}/draft`, { draft }).then(r => r.data),

    createMR: (body: {
      source_branch: string;
      target_branch: string;
      title: string;
      description?: string;
      draft?: boolean;
    }) => http.post<MR>(`/${p}/mrs`, body).then(r => r.data),

    getBranches: (search?: string) =>
      http.get<Array<{ name: string; commit: { id: string } }>>(`/${p}/branches`, { params: { search } }).then(r => r.data),

    getMRPipelineDetail: (iid: number) =>
      http.get<{ pipeline: Pipeline; jobs: Job[]; source: string } | null>(`/${p}/mrs/${iid}/pipeline-detail`).then(r => r.data),

    getPipelineJobs: (pipelineId: number) =>
      http.get<Job[]>(`/${p}/pipelines/${pipelineId}/jobs`).then(r => r.data),

    getJobTrace: (jobId: number) =>
      http.get<string>(`/${p}/jobs/${jobId}/trace`).then(r => r.data),

    playJob: (jobId: number, isBridge = false) =>
      http.post<Job>(`/${p}/jobs/${jobId}/play`, { isBridge }).then(r => r.data),

    retryJob: (jobId: number) =>
      http.post<Job>(`/${p}/jobs/${jobId}/retry`).then(r => r.data),

    cancelJob: (jobId: number) =>
      http.post<Job>(`/${p}/jobs/${jobId}/cancel`).then(r => r.data),

    cancelPipeline: (pipelineId: number) =>
      http.post<Pipeline>(`/${p}/pipelines/${pipelineId}/cancel`).then(r => r.data),

    retryPipeline: (pipelineId: number) =>
      http.post<Pipeline>(`/${p}/pipelines/${pipelineId}/retry`).then(r => r.data),

    triggerPipeline: (ref: string) =>
      http.post<Pipeline>(`/${p}/pipelines`, { ref }).then(r => r.data),

    getEmojis: (iid: number) =>
      http.get<AwardEmoji[]>(`/${p}/mrs/${iid}/emojis`).then(r => r.data),

    addEmoji: (iid: number, name: string) =>
      http.post<AwardEmoji>(`/${p}/mrs/${iid}/emojis`, { name }).then(r => r.data),

    removeEmoji: (iid: number, awardId: number) =>
      http.delete(`/${p}/mrs/${iid}/emojis/${awardId}`).then(r => r.data),

    openInSourceTree: (iid: number) =>
      http.post<{ success: boolean; branch: string; message: string }>(`/${p}/mrs/${iid}/open-sourcetree`).then(r => r.data),

    updateMR: (iid: number, body: { title?: string; description?: string; source_branch?: string; target_branch?: string }) =>
      http.put<MR>(`/${p}/mrs/${iid}`, body).then(r => r.data),

    listPipelines: () =>
      http.get<Pipeline[]>(`/${p}/pipelines`).then(r => r.data),

    getBlockedDeployments: () =>
      http.get<any[]>(`/${p}/deployments/blocked`).then(r => r.data),

    approveDeployment: (deploymentId: number, status: 'approved' | 'rejected' = 'approved') =>
      http.post(`/${p}/deployments/${deploymentId}/approval`, { status }).then(r => r.data),
  };
}

// Keep legacy default for MCP / backward compat
export const api = apiFor(23491);
