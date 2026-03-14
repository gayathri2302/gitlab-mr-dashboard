import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

import express from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createGitlabClient, CURRENT_USER_ID } from './gitlab.js';

const execAsync = promisify(exec);
const app = express();
app.use(cors());
app.use(express.json());

const repoPath = process.env.LOCAL_REPO_PATH!;
const PORT = process.env.PORT || 3001;

function client(req: express.Request) {
  const pid = req.params.projectId || req.query.projectId || process.env.GITLAB_PROJECT_ID!;
  return createGitlabClient(String(pid));
}

// ── MR list & details ──────────────────────────────────────────────────────

app.get('/api/:projectId/mrs', async (req, res) => {
  try {
    const state = (req.query.state as string) || 'opened';
    res.json(await client(req).listMRs(state));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/:projectId/mrs/:id', async (req, res) => {
  try {
    res.json(await client(req).getMR(Number(req.params.id)));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/:projectId/mrs/:id/changes', async (req, res) => {
  try {
    res.json(await client(req).getMRChanges(Number(req.params.id)));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/:projectId/mrs/:id/commits', async (req, res) => {
  try {
    res.json(await client(req).getMRCommits(Number(req.params.id)));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/:projectId/mrs/:id/approvals', async (req, res) => {
  try {
    res.json(await client(req).getMRApprovals(Number(req.params.id)));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── MR actions ─────────────────────────────────────────────────────────────

app.post('/api/:projectId/mrs/:id/merge', async (req, res) => {
  try {
    const gl = client(req);
    const mrIid = Number(req.params.id);
    const merged = await gl.mergeMR(mrIid, req.body.commitMessage);
    // Post a comment after merge
    const now = new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
    await gl.createMRNote(mrIid, `✅ Merged by Gayathri on ${now}`).catch(() => {});
    res.json(merged);
  } catch (e: any) {
    res.status(500).json({ error: e.response?.data?.message || e.message });
  }
});

app.post('/api/:projectId/mrs/:id/close', async (req, res) => {
  try {
    res.json(await client(req).closeMR(Number(req.params.id)));
  } catch (e: any) { res.status(500).json({ error: e.response?.data?.message || e.message }); }
});

app.post('/api/:projectId/mrs/:id/reopen', async (req, res) => {
  try {
    res.json(await client(req).reopenMR(Number(req.params.id)));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/:projectId/mrs/:id/draft', async (req, res) => {
  try {
    res.json(await client(req).setDraft(Number(req.params.id), req.body.draft as boolean));
  } catch (e: any) { res.status(500).json({ error: e.response?.data?.message || e.message }); }
});

// ── Edit MR ────────────────────────────────────────────────────────────────

app.put('/api/:projectId/mrs/:id', async (req, res) => {
  try {
    res.json(await client(req).updateMR(Number(req.params.id), req.body));
  } catch (e: any) { res.status(500).json({ error: e.response?.data?.message || e.message }); }
});

// ── Create MR ──────────────────────────────────────────────────────────────

app.post('/api/:projectId/mrs', async (req, res) => {
  try {
    res.json(await client(req).createMR(req.body));
  } catch (e: any) {
    res.status(500).json({ error: e.response?.data?.message || e.message });
  }
});

app.get('/api/:projectId/branches', async (req, res) => {
  try {
    res.json(await client(req).getBranches(req.query.search as string));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Emoji reactions ────────────────────────────────────────────────────────

app.get('/api/:projectId/mrs/:id/emojis', async (req, res) => {
  try {
    const all = await client(req).getAwardEmojis(Number(req.params.id));
    res.json(all.map((e: any) => ({ ...e, is_mine: e.user?.id === CURRENT_USER_ID })));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/:projectId/mrs/:id/emojis', async (req, res) => {
  try {
    res.json(await client(req).addAwardEmoji(Number(req.params.id), req.body.name));
  } catch (e: any) { res.status(500).json({ error: e.response?.data?.message || e.message }); }
});

app.delete('/api/:projectId/mrs/:id/emojis/:awardId', async (req, res) => {
  try {
    res.json(await client(req).removeAwardEmoji(Number(req.params.id), Number(req.params.awardId)));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Pipelines ──────────────────────────────────────────────────────────────

app.get('/api/:projectId/pipelines', async (req, res) => {
  try {
    res.json(await client(req).listPipelines(30));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/:projectId/mrs/:id/pipeline-detail', async (req, res) => {
  try {
    res.json(await client(req).getLatestPipelineForMR(Number(req.params.id)));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/:projectId/pipelines/:id/jobs', async (req, res) => {
  try {
    res.json(await client(req).getPipelineJobs(Number(req.params.id)));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/:projectId/jobs/:id/play', async (req, res) => {
  try {
    const isBridge = req.body?.isBridge === true;
    res.json(await client(req).playJob(Number(req.params.id), isBridge));
  } catch (e: any) {
    const status = e.response?.status || 500;
    const detail = e.response?.data?.message || e.response?.data?.error || e.message;
    console.error('Play job error:', status, JSON.stringify(e.response?.data || e.message));
    res.status(status).json({ error: typeof detail === 'object' ? JSON.stringify(detail) : detail });
  }
});

app.get('/api/:projectId/deployments/blocked', async (req, res) => {
  try {
    res.json(await client(req).getBlockedDeployments());
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/:projectId/deployments/:id/approval', async (req, res) => {
  try {
    const result = await client(req).approveDeployment(Number(req.params.id), req.body.status || 'approved', req.body.comment);
    res.json(result);
  } catch (e: any) {
    const status = e.response?.status || 500;
    const detail = e.response?.data?.message || e.response?.data?.error || e.message;
    console.error('Deployment approval error:', status, JSON.stringify(e.response?.data || e.message));
    res.status(status).json({ error: typeof detail === 'object' ? JSON.stringify(detail) : detail });
  }
});

app.post('/api/:projectId/jobs/:id/cancel', async (req, res) => {
  try {
    res.json(await client(req).cancelJob(Number(req.params.id)));
  } catch (e: any) {
    const status = e.response?.status || 500;
    const detail = e.response?.data?.message || e.response?.data?.error || e.message;
    res.status(status).json({ error: typeof detail === 'object' ? JSON.stringify(detail) : detail });
  }
});

app.post('/api/:projectId/pipelines/:id/cancel', async (req, res) => {
  try {
    res.json(await client(req).cancelPipeline(Number(req.params.id)));
  } catch (e: any) {
    const status = e.response?.status || 500;
    const detail = e.response?.data?.message || e.response?.data?.error || e.message;
    res.status(status).json({ error: typeof detail === 'object' ? JSON.stringify(detail) : detail });
  }
});

app.post('/api/:projectId/pipelines/:id/retry', async (req, res) => {
  try {
    res.json(await client(req).retryPipeline(Number(req.params.id)));
  } catch (e: any) {
    const status = e.response?.status || 500;
    const detail = e.response?.data?.message || e.response?.data?.error || e.message;
    res.status(status).json({ error: typeof detail === 'object' ? JSON.stringify(detail) : detail });
  }
});

app.post('/api/:projectId/pipelines', async (req, res) => {
  try {
    res.json(await client(req).triggerPipeline(req.body.ref));
  } catch (e: any) {
    const status = e.response?.status || 500;
    const detail = e.response?.data?.message || e.response?.data?.error || e.message;
    res.status(status).json({ error: typeof detail === 'object' ? JSON.stringify(detail) : detail });
  }
});

app.post('/api/:projectId/jobs/:id/retry', async (req, res) => {
  try {
    res.json(await client(req).retryJob(Number(req.params.id)));
  } catch (e: any) {
    const status = e.response?.status || 500;
    const detail = e.response?.data?.message || e.response?.data?.error || e.message;
    console.error('Retry job error:', status, detail);
    res.status(status).json({ error: detail });
  }
});

app.get('/api/:projectId/jobs/:id/trace', async (req, res) => {
  try {
    res.type('text/plain').send(await client(req).getJobTrace(Number(req.params.id)));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── SourceTree ─────────────────────────────────────────────────────────────

app.post('/api/:projectId/mrs/:id/open-sourcetree', async (req, res) => {
  try {
    const mr = await client(req).getMR(Number(req.params.id));
    await execAsync(`git -C "${repoPath}" fetch origin "${mr.source_branch}"`, { timeout: 30000 });
    await execAsync(`open -a SourceTree "${repoPath}"`);
    res.json({ success: true, branch: mr.source_branch, message: `Fetched "${mr.source_branch}" and opened SourceTree` });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Diagnostics ────────────────────────────────────────────────────────────

app.get('/api/whoami', async (_req, res) => {
  try {
    const { config } = await import('dotenv');
    const token = process.env.GITLAB_TOKEN!;
    const url = process.env.GITLAB_URL!;
    const { default: axios } = await import('axios');
    const result = await axios.get(`${url}/api/v4/user`, {
      headers: { 'PRIVATE-TOKEN': token },
    });
    res.json({ user: result.data, token_prefix: token?.slice(0, 6) + '...' });
  } catch (e: any) {
    res.status(500).json({ error: e.response?.data || e.message });
  }
});

// ── Start ──────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`GitLab MR Dashboard API running on http://localhost:${PORT}`);
});
