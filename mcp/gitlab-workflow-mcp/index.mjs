import { execFile } from 'node:child_process';
import { readFileSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadEnv(path.resolve(__dirname, '../../.env'));
loadEnv(path.resolve(__dirname, '.env'));

const CONFIG = {
  gitlabUrl: requireEnv('GITLAB_URL').replace(/\/+$/, ''),
  gitlabToken: requireEnv('GITLAB_TOKEN'),
  gitlabProjectId: process.env.GITLAB_PROJECT_ID || '',
  gitlabProjectPath: process.env.GITLAB_PROJECT_PATH || '',
  repoPath: requireEnv('LOCAL_REPO_PATH'),
  stateDir: process.env.STATE_DIR || path.resolve(__dirname, '.state'),
};

if (!CONFIG.gitlabProjectId && !CONFIG.gitlabProjectPath) {
  throw new Error('Set GITLAB_PROJECT_ID or GITLAB_PROJECT_PATH in the MCP env.');
}

await fs.mkdir(CONFIG.stateDir, { recursive: true });

const TOOLS = [
  {
    name: 'create_branch_push_and_merge_request',
    description:
      'Create or switch to a source branch, commit local work if needed, push it, and create a GitLab merge request into a target branch.',
    inputSchema: {
      type: 'object',
      properties: {
        source_branch: { type: 'string', description: 'Source branch to create or use.' },
        target_branch: { type: 'string', description: 'Target branch for the merge request.' },
        branch_from: { type: 'string', description: 'Optional base ref when creating a new source branch.' },
        commit_message: { type: 'string', description: 'Optional commit message for local changes.' },
        mr_title: { type: 'string', description: 'Optional merge request title override.' },
        extra_context: { type: 'string', description: 'Optional additional notes to append to the MR description.' },
        draft: { type: 'boolean', description: 'Whether to create the merge request as draft.' },
        squash: { type: 'boolean', description: 'Whether to request squash on merge.' },
        remove_source_branch: { type: 'boolean', description: 'Whether GitLab should remove the source branch after merge.' },
        labels: { type: 'array', items: { type: 'string' }, description: 'Optional GitLab labels.' },
        reviewer_ids: { type: 'array', items: { type: 'number' }, description: 'Optional GitLab reviewer IDs.' },
        assignee_ids: { type: 'array', items: { type: 'number' }, description: 'Optional GitLab assignee IDs.' }
      },
      required: ['source_branch', 'target_branch'],
      additionalProperties: false
    }
  },
  {
    name: 'start_cherry_pick_to_targets',
    description:
      'Cherry-pick a source ref onto multiple target branches. If a conflict happens, the session pauses until you resolve it and call resume.',
    inputSchema: {
      type: 'object',
      properties: {
        source_ref: { type: 'string', description: 'Commit, tag, or branch to cherry-pick. Defaults to HEAD.' },
        target_branches: { type: 'array', items: { type: 'string' }, description: 'Target branches to cherry-pick onto.' },
        push: { type: 'boolean', description: 'Push each target branch after a successful cherry-pick. Defaults to true.' }
      },
      required: ['target_branches'],
      additionalProperties: false
    }
  },
  {
    name: 'resume_cherry_pick_session',
    description: 'Resume a cherry-pick session after you manually resolve the conflict in the repo.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'Cherry-pick session ID returned by start_cherry_pick_to_targets.' }
      },
      required: ['session_id'],
      additionalProperties: false
    }
  },
  {
    name: 'get_cherry_pick_session',
    description: 'Read the current status for a cherry-pick session.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'Cherry-pick session ID.' }
      },
      required: ['session_id'],
      additionalProperties: false
    }
  },
  {
    name: 'abort_cherry_pick_session',
    description: 'Abort an active cherry-pick session, abort the git cherry-pick if needed, and restore the original branch.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'Cherry-pick session ID.' }
      },
      required: ['session_id'],
      additionalProperties: false
    }
  }
];

const toolHandlers = {
  create_branch_push_and_merge_request: createBranchPushAndMergeRequest,
  start_cherry_pick_to_targets: startCherryPickToTargets,
  resume_cherry_pick_session: resumeCherryPickSession,
  get_cherry_pick_session: getCherryPickSession,
  abort_cherry_pick_session: abortCherryPickSession,
};

startServer();

function startServer() {
  let buffer = Buffer.alloc(0);

  process.stdin.on('data', async (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) {
        return;
      }

      const header = buffer.slice(0, headerEnd).toString('utf8');
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        buffer = Buffer.alloc(0);
        return;
      }

      const contentLength = Number(match[1]);
      const totalLength = headerEnd + 4 + contentLength;
      if (buffer.length < totalLength) {
        return;
      }

      const payload = buffer.slice(headerEnd + 4, totalLength).toString('utf8');
      buffer = buffer.slice(totalLength);

      let message;
      try {
        message = JSON.parse(payload);
      } catch (error) {
        continue;
      }

      try {
        await handleMessage(message);
      } catch (error) {
        if (message?.id !== undefined) {
          send({
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: -32000,
              message: error instanceof Error ? error.message : String(error),
            },
          });
        }
      }
    }
  });

  process.stdin.resume();
}

async function handleMessage(message) {
  if (!message || typeof message !== 'object') {
    return;
  }

  if (message.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: message.params?.protocolVersion || '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: {
          name: 'gitlab-workflow-mcp',
          version: '1.0.0',
        },
      },
    });
    return;
  }

  if (message.method === 'notifications/initialized') {
    return;
  }

  if (message.method === 'tools/list') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: { tools: TOOLS },
    });
    return;
  }

  if (message.method === 'tools/call') {
    const name = message.params?.name;
    const handler = toolHandlers[name];
    if (!handler) {
      throw new Error(`Unknown tool: ${name}`);
    }

    const result = await handler(message.params?.arguments || {});
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        content: [
          {
            type: 'text',
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
          },
        ],
      },
    });
  }
}

async function createBranchPushAndMergeRequest(args) {
  const sourceBranch = requireString(args.source_branch, 'source_branch');
  const targetBranch = requireString(args.target_branch, 'target_branch');
  const branchFrom = args.branch_from || null;
  const originalBranch = await git(['rev-parse', '--abbrev-ref', 'HEAD']);

  await ensureNoCherryPickInProgress();
  await verifyRemoteBranch(targetBranch);

  const dirtyBefore = await getWorkingTreeStatus();
  await ensureSourceBranchCheckedOut(sourceBranch, branchFrom);

  let commitMessage = null;
  if (dirtyBefore.length) {
    const generatedCommitMessage = args.commit_message || (await generateCommitMessage(sourceBranch));
    await git(['add', '-A']);
    await git(['commit', '-m', generatedCommitMessage]);
    commitMessage = generatedCommitMessage;
  }

  const commitCount = await countCommitsBetween(targetBranch, sourceBranch);
  if (commitCount === 0) {
    throw new Error(`No source-branch commits were found between "${sourceBranch}" and "${targetBranch}".`);
  }

  await git(['push', '-u', 'origin', sourceBranch]);

  const existingMr = await findOpenMergeRequest(sourceBranch, targetBranch);
  if (existingMr) {
    return {
      status: 'already_exists',
      source_branch: sourceBranch,
      target_branch: targetBranch,
      original_branch: originalBranch,
      commit_message: commitMessage,
      merge_request: {
        iid: existingMr.iid,
        title: existingMr.title,
        web_url: existingMr.web_url,
      },
    };
  }

  const description = await buildMergeRequestDescription({
    sourceBranch,
    targetBranch,
    extraContext: args.extra_context || '',
  });

  const generatedTitle = args.mr_title || (await generateMergeRequestTitle(sourceBranch));
  const title = args.draft && !generatedTitle.startsWith('Draft: ')
    ? `Draft: ${generatedTitle}`
    : generatedTitle;

  const createdMr = await createMergeRequest({
    source_branch: sourceBranch,
    target_branch: targetBranch,
    title,
    description,
    remove_source_branch: Boolean(args.remove_source_branch),
    squash: Boolean(args.squash),
    labels: Array.isArray(args.labels) && args.labels.length ? args.labels.join(',') : undefined,
    reviewer_ids: toNumberArray(args.reviewer_ids),
    assignee_ids: toNumberArray(args.assignee_ids),
  });

  return {
    status: 'created',
    source_branch: sourceBranch,
    target_branch: targetBranch,
    original_branch: originalBranch,
    commit_message: commitMessage,
    merge_request: {
      iid: createdMr.iid,
      title: createdMr.title,
      web_url: createdMr.web_url,
    },
  };
}

async function startCherryPickToTargets(args) {
  const sourceRef = args.source_ref || 'HEAD';
  const targetBranches = uniqueStrings(args.target_branches);
  if (!targetBranches.length) {
    throw new Error('target_branches must contain at least one branch name.');
  }

  await ensureNoCherryPickInProgress();
  await ensureWorkingTreeClean();

  const originalBranch = await git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const sourceSha = await git(['rev-parse', sourceRef]);

  for (const targetBranch of targetBranches) {
    await verifyRemoteBranch(targetBranch);
  }

  const session = {
    session_id: randomUUID(),
    source_ref: sourceRef,
    source_sha: sourceSha,
    target_branches: targetBranches,
    completed: [],
    original_branch: originalBranch,
    current_branch: null,
    push: args.push !== false,
    status: 'running',
    conflict_branch: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await saveSession(session);
  return processCherryPickSession(session);
}

async function resumeCherryPickSession(args) {
  const session = await loadSession(requireString(args.session_id, 'session_id'));
  return processCherryPickSession(session, { resume: true });
}

async function getCherryPickSession(args) {
  return loadSession(requireString(args.session_id, 'session_id'));
}

async function abortCherryPickSession(args) {
  const session = await loadSession(requireString(args.session_id, 'session_id'));
  if (await cherryPickInProgress()) {
    await git(['cherry-pick', '--abort']);
  }

  if (session.original_branch) {
    await git(['checkout', session.original_branch]);
  }

  session.status = 'aborted';
  session.updated_at = new Date().toISOString();
  await saveSession(session);
  return session;
}

async function processCherryPickSession(session, options = {}) {
  if (options.resume) {
    if (session.status !== 'waiting_for_resolution') {
      throw new Error(`Session ${session.session_id} is not waiting for resolution.`);
    }

    const conflicts = await getUnmergedFiles();
    if (conflicts.length) {
      return {
        status: 'waiting_for_resolution',
        session_id: session.session_id,
        conflict_branch: session.conflict_branch,
        unresolved_files: conflicts,
        message: `Resolve the conflicts in ${CONFIG.repoPath}, stage the files, then call resume_cherry_pick_session again.`,
      };
    }

    if (await cherryPickInProgress()) {
      await git(['cherry-pick', '--continue']);
      if (session.push) {
        await git(['push', 'origin', `HEAD:${session.conflict_branch}`]);
      }
      const head = await git(['rev-parse', 'HEAD']);
      session.completed.push({
        branch: session.conflict_branch,
        head,
        resumed: true,
      });
      session.conflict_branch = null;
      session.status = 'running';
      session.updated_at = new Date().toISOString();
      await saveSession(session);
    }
  }

  while (session.completed.length < session.target_branches.length) {
    const nextBranch = session.target_branches[session.completed.length];
    session.current_branch = nextBranch;
    session.updated_at = new Date().toISOString();
    await saveSession(session);

    await git(['fetch', 'origin', nextBranch]);
    await git(['checkout', nextBranch]);
    await git(['pull', '--ff-only', 'origin', nextBranch]);

    try {
      await git(['cherry-pick', session.source_sha]);
    } catch (error) {
      const conflicts = await getUnmergedFiles();
      if (conflicts.length || await cherryPickInProgress()) {
        session.status = 'waiting_for_resolution';
        session.conflict_branch = nextBranch;
        session.updated_at = new Date().toISOString();
        await saveSession(session);
        return {
          status: 'waiting_for_resolution',
          session_id: session.session_id,
          conflict_branch: nextBranch,
          unresolved_files: conflicts,
          completed: session.completed,
          message: `Cherry-pick paused on ${nextBranch}. Resolve the conflicts in ${CONFIG.repoPath}, stage the fixes, and call resume_cherry_pick_session.`,
        };
      }
      throw error;
    }

    if (session.push) {
      await git(['push', 'origin', `HEAD:${nextBranch}`]);
    }

    const head = await git(['rev-parse', 'HEAD']);
    session.completed.push({
      branch: nextBranch,
      head,
      resumed: false,
    });
    session.current_branch = null;
    session.updated_at = new Date().toISOString();
    await saveSession(session);
  }

  await git(['checkout', session.original_branch]);
  session.status = 'completed';
  session.updated_at = new Date().toISOString();
  await saveSession(session);
  return session;
}

async function ensureSourceBranchCheckedOut(sourceBranch, branchFrom) {
  const currentBranch = await git(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (currentBranch === sourceBranch) {
    return;
  }

  if (await localBranchExists(sourceBranch)) {
    await git(['checkout', sourceBranch]);
    return;
  }

  const baseRef = branchFrom || currentBranch;
  await git(['checkout', '-b', sourceBranch, baseRef]);
}

async function verifyRemoteBranch(branchName) {
  const exists = await remoteBranchExists(branchName);
  if (!exists) {
    throw new Error(`Remote branch "${branchName}" was not found on origin.`);
  }
}

async function buildMergeRequestDescription({ sourceBranch, targetBranch, extraContext }) {
  const commits = await getCommitList(targetBranch, sourceBranch);
  const changedFiles = await getChangedFiles(targetBranch, sourceBranch);
  const diffStat = await gitOptional(['diff', '--stat', `${targetBranch}...${sourceBranch}`]);
  const latestCommitBody = await gitOptional(['log', '-1', '--pretty=%b', sourceBranch]);
  const mergeBase = await gitOptional(['merge-base', sourceBranch, targetBranch]);
  const originUrl = await gitOptional(['remote', 'get-url', 'origin']);

  const summarySubjects = commits.slice(0, 3).map((commit) => commit.subject.replace(/\.$/, ''));
  const summary = summarySubjects.length
    ? `This MR merges \`${sourceBranch}\` into \`${targetBranch}\` and includes ${commits.length} commit(s) focused on: ${summarySubjects.join('; ')}.`
    : `This MR merges \`${sourceBranch}\` into \`${targetBranch}\`.`;

  return [
    '## Summary',
    '',
    summary,
    '',
    '## Work Completed',
    '',
    ...commits.map((commit) => `- ${commit.hash} ${commit.subject}`),
    '',
    '## Files Changed',
    '',
    ...(changedFiles.length
      ? changedFiles.map((file) => `- ${file.status} ${file.path}`)
      : ['- No changed files detected']),
    '',
    diffStat ? '## Diff Stat' : '',
    diffStat ? '' : '',
    diffStat || '',
    diffStat ? '' : '',
    latestCommitBody.trim() ? '## Additional Notes' : '',
    latestCommitBody.trim() ? '' : '',
    latestCommitBody.trim() || '',
    latestCommitBody.trim() ? '' : '',
    extraContext?.trim() ? '## Extra Context' : '',
    extraContext?.trim() ? '' : '',
    extraContext?.trim() || '',
    extraContext?.trim() ? '' : '',
    '## Validation',
    '',
    '- [ ] Tests run locally',
    '- [ ] Screenshots attached if UI changed',
    '- [ ] Risks and follow-ups called out',
    '',
    '## Repository Context',
    '',
    `- Source branch: \`${sourceBranch}\``,
    `- Target branch: \`${targetBranch}\``,
    `- Merge base: \`${mergeBase || 'unknown'}\``,
    `- Remote: \`${originUrl || 'unknown'}\``,
  ].filter(Boolean).join('\n');
}

async function generateMergeRequestTitle(sourceBranch) {
  const latestSubject = (await gitOptional(['log', '-1', '--pretty=%s', sourceBranch])).trim();
  if (latestSubject && !looksLikeBranchName(latestSubject)) {
    return latestSubject;
  }
  return humanizeBranchName(sourceBranch);
}

async function generateCommitMessage(sourceBranch) {
  const files = await git(['diff', '--name-only']);
  const fileList = files.split('\n').map((line) => line.trim()).filter(Boolean);
  const branchTitle = humanizeBranchName(sourceBranch);
  if (!fileList.length) {
    return branchTitle;
  }
  const shortFiles = fileList.slice(0, 3).map((file) => path.basename(file));
  return `${branchTitle}: update ${shortFiles.join(', ')}`;
}

async function countCommitsBetween(targetBranch, sourceBranch) {
  const output = await gitOptional(['rev-list', '--count', `${targetBranch}..${sourceBranch}`]);
  return Number(output || '0');
}

async function getCommitList(targetBranch, sourceBranch) {
  const output = await gitOptional(['log', `${targetBranch}..${sourceBranch}`, '--max-count=20', '--pretty=format:%h%x09%s']);
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [hash, ...rest] = line.split('\t');
      return { hash, subject: rest.join('\t').trim() };
    });
}

async function getChangedFiles(targetBranch, sourceBranch) {
  const output = await gitOptional(['diff', '--name-status', `${targetBranch}...${sourceBranch}`]);
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [status, ...rest] = line.split('\t');
      return { status, path: rest.join(' -> ').trim() };
    });
}

async function findOpenMergeRequest(sourceBranch, targetBranch) {
  const search = new URLSearchParams({
    state: 'opened',
    source_branch: sourceBranch,
    target_branch: targetBranch,
    per_page: '1',
  });
  const result = await gitlabRequest('GET', `/merge_requests?${search.toString()}`);
  return Array.isArray(result) && result.length ? result[0] : null;
}

async function createMergeRequest(payload) {
  return gitlabRequest('POST', '/merge_requests', payload);
}

async function gitlabRequest(method, resourcePath, body) {
  const projectRef = encodeURIComponent(CONFIG.gitlabProjectId || CONFIG.gitlabProjectPath);
  const response = await fetch(`${CONFIG.gitlabUrl}/api/v4/projects/${projectRef}${resourcePath}`, {
    method,
    headers: {
      'PRIVATE-TOKEN': CONFIG.gitlabToken,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`GitLab API error ${response.status}: ${await response.text()}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function ensureWorkingTreeClean() {
  const status = await getWorkingTreeStatus();
  if (status.length) {
    throw new Error('Working tree is not clean. Commit, stash, or discard your changes before starting the cherry-pick flow.');
  }
}

async function getWorkingTreeStatus() {
  const output = await git(['status', '--short']);
  return output.split('\n').map((line) => line.trim()).filter(Boolean);
}

async function ensureNoCherryPickInProgress() {
  if (await cherryPickInProgress()) {
    throw new Error('A cherry-pick is already in progress in the configured repo.');
  }
}

async function cherryPickInProgress() {
  const gitDir = await git(['rev-parse', '--git-dir']);
  try {
    await fs.access(path.resolve(CONFIG.repoPath, gitDir, 'CHERRY_PICK_HEAD'));
    return true;
  } catch {
    return false;
  }
}

async function getUnmergedFiles() {
  const output = await gitOptional(['diff', '--name-only', '--diff-filter=U']);
  return output.split('\n').map((line) => line.trim()).filter(Boolean);
}

async function localBranchExists(branchName) {
  try {
    await git(['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`]);
    return true;
  } catch {
    return false;
  }
}

async function remoteBranchExists(branchName) {
  const output = await gitOptional(['ls-remote', '--heads', 'origin', branchName]);
  return Boolean(output.trim());
}

async function git(args) {
  const { stdout } = await execFileAsync('git', args, {
    cwd: CONFIG.repoPath,
    maxBuffer: 1024 * 1024 * 20,
  });
  return stdout.trim();
}

async function gitOptional(args) {
  try {
    return await git(args);
  } catch {
    return '';
  }
}

async function saveSession(session) {
  session.updated_at = new Date().toISOString();
  await fs.writeFile(sessionFile(session.session_id), JSON.stringify(session, null, 2));
}

async function loadSession(sessionId) {
  const raw = await fs.readFile(sessionFile(sessionId), 'utf8');
  return JSON.parse(raw);
}

function sessionFile(sessionId) {
  return path.join(CONFIG.stateDir, `${sessionId}.json`);
}

function send(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}

function loadEnv(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      const index = trimmed.indexOf('=');
      if (index === -1) {
        continue;
      }
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim();
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    return;
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function requireString(value, name) {
  if (!value || typeof value !== 'string') {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function toNumberArray(value) {
  return Array.isArray(value) ? value.filter((item) => Number.isFinite(item)) : undefined;
}

function uniqueStrings(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()))];
}

function looksLikeBranchName(value) {
  return /^[A-Z]+-\d+[-_]/.test(value) || value.includes('/') || value.includes('_');
}

function humanizeBranchName(branchName) {
  const leaf = branchName.split('/').filter(Boolean).pop() || branchName;
  const issueMatch = leaf.match(/^([A-Z]+-\d+)[-_](.+)$/);
  if (issueMatch) {
    return `${issueMatch[1]}: ${toTitleCase(issueMatch[2])}`;
  }
  return toTitleCase(leaf);
}

function toTitleCase(value) {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
