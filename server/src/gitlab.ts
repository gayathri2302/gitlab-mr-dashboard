import axios from 'axios';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

const GITLAB_URL = process.env.GITLAB_URL!;
const GITLAB_TOKEN = process.env.GITLAB_TOKEN!;
export const CURRENT_USER_ID = Number(process.env.GITLAB_CURRENT_USER_ID || '0');

function makeApi(projectId: number | string) {
  return axios.create({
    baseURL: `${GITLAB_URL}/api/v4/projects/${projectId}`,
    headers: { 'PRIVATE-TOKEN': GITLAB_TOKEN },
  });
}

export function createGitlabClient(projectId: number | string) {
  const api = makeApi(projectId);

  return {
    listMRs: async (state = 'opened', perPage = 50) => {
      const res = await api.get('/merge_requests', {
        params: { state, per_page: perPage, order_by: 'updated_at', sort: 'desc' },
      });
      return res.data;
    },

    getMR: async (mrIid: number) => {
      const res = await api.get(`/merge_requests/${mrIid}`);
      return res.data;
    },

    getMRChanges: async (mrIid: number) => {
      const all: any[] = [];
      let page = 1;
      while (true) {
        const res = await api.get(`/merge_requests/${mrIid}/diffs`, {
          params: { per_page: 100, page },
        });
        const items: any[] = res.data;
        all.push(...items);
        const totalPages = Number(res.headers['x-total-pages'] || 1);
        if (page >= totalPages || items.length === 0) break;
        page++;
      }
      return all;
    },

    getMRCommits: async (mrIid: number) => {
      const all: any[] = [];
      let page = 1;
      while (true) {
        const res = await api.get(`/merge_requests/${mrIid}/commits`, {
          params: { per_page: 100, page },
        });
        const items: any[] = res.data;
        all.push(...items);
        const totalPages = Number(res.headers['x-total-pages'] || 1);
        if (page >= totalPages || items.length === 0) break;
        page++;
      }
      return all;
    },

    getMRApprovals: async (mrIid: number) => {
      const res = await api.get(`/merge_requests/${mrIid}/approvals`);
      return res.data;
    },

    getMRNotes: async (mrIid: number) => {
      const res = await api.get(`/merge_requests/${mrIid}/notes`, {
        params: { per_page: 50, sort: 'asc' },
      });
      return res.data;
    },

    createMRNote: async (mrIid: number, body: string) => {
      const res = await api.post(`/merge_requests/${mrIid}/notes`, { body });
      return res.data;
    },

    // Award emoji (like / dislike / reactions)
    getAwardEmojis: async (mrIid: number) => {
      const res = await api.get(`/merge_requests/${mrIid}/award_emoji`);
      return res.data;
    },

    addAwardEmoji: async (mrIid: number, name: string) => {
      const res = await api.post(`/merge_requests/${mrIid}/award_emoji`, { name });
      return res.data;
    },

    removeAwardEmoji: async (mrIid: number, awardId: number) => {
      await api.delete(`/merge_requests/${mrIid}/award_emoji/${awardId}`);
      return { success: true };
    },

    // Merge / close / reopen
    mergeMR: async (mrIid: number, commitMessage?: string) => {
      const body: Record<string, string> = {};
      if (commitMessage) body.merge_commit_message = commitMessage;
      const res = await api.put(`/merge_requests/${mrIid}/merge`, body);
      return res.data;
    },

    closeMR: async (mrIid: number) => {
      const res = await api.put(`/merge_requests/${mrIid}`, { state_event: 'close' });
      return res.data;
    },

    reopenMR: async (mrIid: number) => {
      const res = await api.put(`/merge_requests/${mrIid}`, { state_event: 'reopen' });
      return res.data;
    },

    // Draft toggle — set/unset "Draft:" prefix via the draft field
    setDraft: async (mrIid: number, draft: boolean) => {
      const res = await api.put(`/merge_requests/${mrIid}`, { draft });
      return res.data;
    },

    // Create MR
    createMR: async (params: {
      source_branch: string;
      target_branch: string;
      title: string;
      description?: string;
      assignee_id?: number;
      draft?: boolean;
    }) => {
      const res = await api.post('/merge_requests', params);
      return res.data;
    },

    // Update MR (title, description, source/target branch)
    updateMR: async (mrIid: number, params: { title?: string; description?: string; source_branch?: string; target_branch?: string }) => {
      const res = await api.put(`/merge_requests/${mrIid}`, params);
      return res.data;
    },

    // List recent pipelines for the project
    listPipelines: async (perPage = 30) => {
      const res = await api.get('/pipelines', {
        params: { per_page: perPage, order_by: 'id', sort: 'desc' },
      });
      return res.data;
    },

    // Get branches for the create MR form
    getBranches: async (search?: string) => {
      const params: Record<string, any> = { per_page: 50 };
      if (search) params.search = search;
      const res = await api.get('/repository/branches', { params });
      return res.data;
    },

    // Pipelines
    getMRPipelines: async (mrIid: number) => {
      const res = await api.get(`/merge_requests/${mrIid}/pipelines`);
      return res.data;
    },

    getPipeline: async (pipelineId: number) => {
      const res = await api.get(`/pipelines/${pipelineId}`);
      return res.data;
    },

    getPipelineJobs: async (pipelineId: number) => {
      // Fetch both regular jobs and bridge jobs (manual approvals, downstream triggers)
      const [jobsRes, bridgesRes] = await Promise.all([
        api.get(`/pipelines/${pipelineId}/jobs`, { params: { per_page: 100 } }),
        api.get(`/pipelines/${pipelineId}/bridges`, { params: { per_page: 100 } }).catch(() => ({ data: [] })),
      ]);
      // Mark bridge jobs so the frontend knows the type
      const bridges = bridgesRes.data.map((b: any) => ({ ...b, _is_bridge: true }));
      return [...jobsRes.data, ...bridges];
    },

    getJobTrace: async (jobId: number) => {
      const res = await api.get(`/jobs/${jobId}/trace`, { responseType: 'text' });
      return res.data;
    },

    playJob: async (jobId: number, isBridge = false) => {
      if (isBridge) {
        // For bridge jobs, we need to try the play endpoint
        // Bridge jobs don't have /play — but they may be triggered via the jobs endpoint too
        // Try regular job play first, fall back to bridge-specific handling
        try {
          const res = await api.post(`/jobs/${jobId}/play`);
          return res.data;
        } catch (err: any) {
          // If it's a 404 (not a regular job), try as a bridge
          if (err.response?.status === 404) {
            // For manual bridge jobs, we need to use the downstream pipeline play
            throw new Error('Bridge jobs must be triggered from GitLab UI or via deployment approvals');
          }
          throw err;
        }
      }
      const res = await api.post(`/jobs/${jobId}/play`);
      return res.data;
    },

    retryJob: async (jobId: number) => {
      const res = await api.post(`/jobs/${jobId}/retry`);
      return res.data;
    },

    cancelJob: async (jobId: number) => {
      const res = await api.post(`/jobs/${jobId}/cancel`);
      return res.data;
    },

    cancelPipeline: async (pipelineId: number) => {
      const res = await api.post(`/pipelines/${pipelineId}/cancel`);
      return res.data;
    },

    retryPipeline: async (pipelineId: number) => {
      const res = await api.post(`/pipelines/${pipelineId}/retry`);
      return res.data;
    },

    triggerPipeline: async (ref: string) => {
      const res = await api.post('/pipeline', { ref });
      return res.data;
    },

    getBlockedDeployments: async () => {
      const res = await api.get('/deployments', {
        params: { status: 'blocked', per_page: 20, order_by: 'id', sort: 'desc' },
      });
      return res.data;
    },

    approveDeployment: async (deploymentId: number, status: 'approved' | 'rejected' = 'approved', comment?: string) => {
      const body: Record<string, string> = { status };
      if (comment) body.comment = comment;
      const res = await api.post(`/deployments/${deploymentId}/approval`, body);
      return res.data;
    },

    getPipelinesBySha: async (sha: string) => {
      const res = await api.get('/pipelines', { params: { sha, per_page: 5 } });
      return res.data;
    },

    getPipelinesByRef: async (ref: string) => {
      const res = await api.get('/pipelines', {
        params: { ref, per_page: 5, order_by: 'id', sort: 'desc' },
      });
      return res.data;
    },

    getLatestPipelineForMR: async (mrIid: number) => {
      const client = createGitlabClient(projectId);

      const mrPipelines = await client.getMRPipelines(mrIid);
      if (mrPipelines.length) {
        const [pipeline, jobs] = await Promise.all([
          client.getPipeline(mrPipelines[0].id),
          client.getPipelineJobs(mrPipelines[0].id),
        ]);
        return { pipeline, jobs, source: 'mr' };
      }

      const mr = await client.getMR(mrIid);

      if (mr.state === 'merged' && mr.merge_commit_sha) {
        const byMergeSha = await client.getPipelinesBySha(mr.merge_commit_sha);
        if (byMergeSha.length) {
          const [pipeline, jobs] = await Promise.all([
            client.getPipeline(byMergeSha[0].id),
            client.getPipelineJobs(byMergeSha[0].id),
          ]);
          return { pipeline, jobs, source: 'merge_commit' };
        }
      }

      if (mr.target_branch) {
        const byBranch = await client.getPipelinesByRef(mr.target_branch);
        if (byBranch.length) {
          const [pipeline, jobs] = await Promise.all([
            client.getPipeline(byBranch[0].id),
            client.getPipelineJobs(byBranch[0].id),
          ]);
          return { pipeline, jobs, source: 'target_branch' };
        }
      }

      return null;
    },
  };
}

// Default client for MCP tools
export const gitlab = createGitlabClient(process.env.GITLAB_PROJECT_ID!);
