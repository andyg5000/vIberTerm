export interface GitRepoInfo {
  path: string;
  branch?: string;
}

export interface Worktree {
  path: string;
  branch: string;
  isMain: boolean;
}

export class GitService {
  constructor(_authClient: unknown) {}
}
