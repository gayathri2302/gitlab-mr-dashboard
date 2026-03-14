import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import { gitlab } from './gitlab.js';

const execAsync = promisify(exec);
const repoPath = process.env.LOCAL_REPO_PATH!;

const server = new McpServer({
  name: 'gitlab-mr-dashboard',
  version: '1.0.0',
});

server.tool(
  'list_merge_requests',
  'List GitLab merge requests for the react-nextgen-ui project',
  { state: z.enum(['opened', 'merged', 'closed', 'all']).optional().describe('MR state filter') },
  async ({ state }) => {
    const mrs = await gitlab.listMRs(state || 'opened');
    const lines = mrs.map((mr: any) =>
      `!${mr.iid} [${mr.state}] ${mr.title}\n  Author: ${mr.author.name} | ${mr.source_branch} → ${mr.target_branch}\n  Status: ${mr.detailed_merge_status} | ${mr.web_url}`
    );
    return { content: [{ type: 'text', text: lines.join('\n\n') }] };
  }
);

server.tool(
  'get_mr_details',
  'Get full details of a specific merge request',
  { mr_iid: z.number().describe('Merge request IID number') },
  async ({ mr_iid }) => {
    const mr = await gitlab.getMR(mr_iid);
    const text = `
MR !${mr.iid}: ${mr.title}
State: ${mr.state}
Author: ${mr.author.name} (@${mr.author.username})
Branch: ${mr.source_branch} → ${mr.target_branch}
Created: ${mr.created_at}
Updated: ${mr.updated_at}
${mr.merged_at ? `Merged: ${mr.merged_at} by ${mr.merged_by?.name}` : ''}
Files changed: ${mr.changes_count || 'N/A'}
Merge status: ${mr.detailed_merge_status}
URL: ${mr.web_url}
Description: ${mr.description || '(none)'}
    `.trim();
    return { content: [{ type: 'text', text }] };
  }
);

server.tool(
  'get_mr_changes',
  'Get the file diffs/changes for a merge request',
  { mr_iid: z.number().describe('Merge request IID number') },
  async ({ mr_iid }) => {
    const diffs = await gitlab.getMRChanges(mr_iid);
    if (!diffs.length) return { content: [{ type: 'text', text: 'No diffs found.' }] };
    const lines = diffs.map((d: any) =>
      `### ${d.new_path || d.old_path} ${d.new_file ? '(new)' : d.deleted_file ? '(deleted)' : d.renamed_file ? `(renamed from ${d.old_path})` : ''}\n\`\`\`diff\n${(d.diff || '').slice(0, 2000)}${(d.diff || '').length > 2000 ? '\n... (truncated)' : ''}\n\`\`\``
    );
    return { content: [{ type: 'text', text: lines.join('\n\n') }] };
  }
);

server.tool(
  'merge_mr',
  'Merge a GitLab merge request',
  {
    mr_iid: z.number().describe('Merge request IID number'),
    commit_message: z.string().optional().describe('Custom merge commit message'),
  },
  async ({ mr_iid, commit_message }) => {
    const result = await gitlab.mergeMR(mr_iid, commit_message);
    return {
      content: [{
        type: 'text',
        text: `MR !${mr_iid} merged successfully.\nMerge commit: ${result.merge_commit_sha}\nMerged at: ${result.merged_at}`,
      }],
    };
  }
);

server.tool(
  'get_pipeline_status',
  'Get the pipeline status for a merge request',
  { mr_iid: z.number().describe('Merge request IID number') },
  async ({ mr_iid }) => {
    const detail = await gitlab.getLatestPipelineForMR(mr_iid);
    if (!detail) return { content: [{ type: 'text', text: 'No pipeline found for this MR.' }] };

    const { pipeline, jobs } = detail;
    const jobLines = jobs.map((j: any) =>
      `  ${j.status === 'failed' ? '✗' : j.status === 'success' ? '✓' : '○'} ${j.name} [${j.status}]${j.duration ? ` (${Math.round(j.duration)}s)` : ''}`
    );
    const text = `Pipeline #${pipeline.id} — ${pipeline.status.toUpperCase()}
SHA: ${pipeline.sha}
Created: ${pipeline.created_at}
Duration: ${pipeline.duration ? `${Math.round(pipeline.duration)}s` : 'N/A'}
URL: ${pipeline.web_url}

Jobs:
${jobLines.join('\n')}`;
    return { content: [{ type: 'text', text }] };
  }
);

server.tool(
  'get_build_failures',
  'Get details of failed build jobs including logs for a merge request',
  { mr_iid: z.number().describe('Merge request IID number') },
  async ({ mr_iid }) => {
    const detail = await gitlab.getLatestPipelineForMR(mr_iid);
    if (!detail) return { content: [{ type: 'text', text: 'No pipeline found.' }] };

    const failedJobs = detail.jobs.filter((j: any) => j.status === 'failed');
    if (!failedJobs.length) return { content: [{ type: 'text', text: 'No failed jobs found.' }] };

    const results = await Promise.all(
      failedJobs.map(async (job: any) => {
        const trace = await gitlab.getJobTrace(job.id).catch(() => 'Could not fetch log.');
        const lastLines = trace.split('\n').slice(-50).join('\n');
        return `### Failed Job: ${job.name} (ID: ${job.id})\nStage: ${job.stage}\n\nLast 50 lines of log:\n\`\`\`\n${lastLines}\n\`\`\``;
      })
    );
    return { content: [{ type: 'text', text: results.join('\n\n---\n\n') }] };
  }
);

server.tool(
  'open_in_sourcetree',
  'Fetch the MR branch locally and open SourceTree for it',
  { mr_iid: z.number().describe('Merge request IID number') },
  async ({ mr_iid }) => {
    const mr = await gitlab.getMR(mr_iid);
    const branch = mr.source_branch;
    await execAsync(`git -C "${repoPath}" fetch origin "${branch}"`);
    await execAsync(`open -a SourceTree "${repoPath}"`);
    return {
      content: [{
        type: 'text',
        text: `Fetched branch "${branch}" and opened SourceTree at ${repoPath}`,
      }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
