export interface MR {
  id: number;
  iid: number;
  title: string;
  description: string;
  state: 'opened' | 'merged' | 'closed';
  created_at: string;
  updated_at: string;
  merged_at?: string;
  merged_by?: { name: string; username: string };
  author: { name: string; username: string; avatar_url: string };
  assignee?: { name: string; username: string };
  source_branch: string;
  target_branch: string;
  sha: string;
  merge_commit_sha?: string;
  changes_count?: string;
  has_conflicts: boolean;
  detailed_merge_status: string;
  web_url: string;
  draft: boolean;
}

export interface Diff {
  old_path: string;
  new_path: string;
  diff: string;
  new_file: boolean;
  renamed_file: boolean;
  deleted_file: boolean;
}

export interface Commit {
  id: string;
  short_id: string;
  title: string;
  author_name: string;
  authored_date: string;
  web_url: string;
}

export interface Pipeline {
  id: number;
  sha: string;
  ref: string;
  status: 'success' | 'failed' | 'running' | 'pending' | 'canceled' | 'skipped' | 'manual';
  created_at: string;
  updated_at: string;
  duration?: number;
  web_url: string;
}

export interface Job {
  id: number;
  name: string;
  stage: string;
  status: 'success' | 'failed' | 'running' | 'pending' | 'canceled' | 'skipped' | 'created' | 'manual';
  created_at: string;
  started_at?: string;
  finished_at?: string;
  duration?: number;
  web_url: string;
  allow_failure: boolean;
  _is_bridge?: boolean;
}

export interface AwardEmoji {
  id: number;
  name: string;
  user: { id: number; name: string; username: string };
  is_mine: boolean;
}

export interface ApprovalUser {
  id: number;
  name: string;
  username: string;
  avatar_url: string;
}

export interface Repo {
  id: number;
  name: string;
  label: string;
  color: string;
}

export const REPOS: Repo[] = [
  { id: 23491, name: 'react-nextgen-ui',         label: 'FE',        color: 'blue'   },
  { id: 23492, name: 'common-services-api',       label: 'BE Common', color: 'green'  },
  { id: 23490, name: 'ngsb-client-service-api',   label: 'BE Client', color: 'purple' },
  { id: 23488, name: 'IEE Virtual Session - Web', label: 'Session',   color: 'orange' },
];
