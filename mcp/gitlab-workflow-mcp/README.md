# GitLab Workflow MCP

This is a standalone MCP server for your `react-nextgen-ui` GitLab workflow.

It supports:

- creating a source branch from your local changes
- committing and pushing that branch
- creating a merge request from `source_branch` to `target_branch`
- generating a detailed MR description from the work done
- cherry-picking a source ref to multiple target branches
- pausing on cherry-pick conflicts and resuming after you resolve them

## Tools

### `create_branch_push_and_merge_request`

Use this when you want the MCP to:

- create or switch to `source_branch`
- commit local changes if present
- push the branch to origin
- create the GitLab MR to `target_branch`

Input:

```json
{
  "source_branch": "NGSB-10762-write-in-flag-indication",
  "target_branch": "main"
}
```

Optional fields:

- `branch_from`
- `commit_message`
- `mr_title`
- `extra_context`
- `draft`
- `squash`
- `remove_source_branch`
- `labels`
- `reviewer_ids`
- `assignee_ids`

### `start_cherry_pick_to_targets`

Starts cherry-picking a source ref into multiple branches.

Input:

```json
{
  "source_ref": "HEAD",
  "target_branches": ["release/2025.10", "release/2025.11"]
}
```

Optional fields:

- `push`

If a conflict happens, the tool stores session state and returns a `session_id`.

### `resume_cherry_pick_session`

Resume a cherry-pick session after you resolve conflicts manually.

Input:

```json
{
  "session_id": "your-session-id"
}
```

### `get_cherry_pick_session`

Reads the current status of a stored cherry-pick session.

### `abort_cherry_pick_session`

Aborts an in-progress cherry-pick session and restores the original branch.

## Running the MCP

```bash
cd /Users/gayathri/Desktop/codebase/gitlab-mr-dashboard/mcp/gitlab-workflow-mcp
node index.mjs
```

## MCP config example

```json
{
  "mcpServers": {
    "gitlab-workflow": {
      "command": "node",
      "args": [
        "/Users/gayathri/Desktop/codebase/gitlab-mr-dashboard/mcp/gitlab-workflow-mcp/index.mjs"
      ]
    }
  }
}
```

## Notes

- Secrets are read from `mcp/gitlab-workflow-mcp/.env`.
- The workflow operates on `LOCAL_REPO_PATH`, which is configured for `react-nextgen-ui`.
- Cherry-picks are applied directly onto the target branches and pushed back to origin by default.
