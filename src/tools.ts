import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { authedLogin, octokit, resolveUser } from './github.js';

const username = z
  .string()
  .optional()
  .describe('GitHub username. Default: owner of token');
const owner = z
  .string()
  .optional()
  .describe('Repo owner. Default: your own username');
const limit = (def: number) =>
  z.number().int().min(1).max(100).default(def).describe('Max result');

// converts result to mcp response format
function ok(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

// returns error message to claude instead of crashing
function safe<T>(fn: (args: T) => Promise<unknown>) {
  return async (args: T) => {
    try {
      return ok(await fn(args));
    } catch (e: any) {
      return {
        isError: true,
        content: [
          { type: 'text' as const, text: `GitHub error: ${e.message ?? e}` },
        ],
      };
    }
  };
}

// formats github event into a short readable form
function summarizeEvent(e: any) {
  const base = { type: e.type, repo: e.repo?.name, at: e.created_at };
  const p = e.payload ?? {};
  switch (e.type) {
    case 'PushEvent':
      return {
        ...base,
        branch: p.ref?.replace('refs/heads/', ''),
        commitCount: p.size ?? p.commits?.length ?? 0,
        commits: p.commits?.map((c: any) => ({
          sha: c.sha.slice(0, 7),
          message: c.message.split('\n')[0],
        })),
      };
    case 'PullRequestEvent':
      return {
        ...base,
        action: p.action,
        number: p.pull_request?.number,
        title: p.pull_request?.title,
        merged: p.pull_request?.merged,
      };
    case 'IssuesEvent':
      return {
        ...base,
        action: p.action,
        number: p.issue?.number,
        title: p.issue?.title,
      };
    case 'CreateEvent':
    case 'DeleteEvent':
      return { ...base, refType: p.ref_type, ref: p.ref };
    case 'IssueCommentEvent':
    case 'PullRequestReviewEvent':
      return { ...base, action: p.action };
    default:
      return base;
  }
}

export function registerTools(server: McpServer) {
  // 1. Profile
  server.tool(
    'get_profile',
    'GitHub profile info: bio, followers, public repo count, etc.',
    { username },
    safe(async ({ username: u }) => {
      const user = await resolveUser(u);
      const { data } = await octokit.rest.users.getByUsername({
        username: user,
      });
      return {
        login: data.login,
        name: data.name,
        bio: data.bio,
        company: data.company,
        location: data.location,
        followers: data.followers,
        following: data.following,
        publicRepos: data.public_repos,
        createdAt: data.created_at,
        url: data.html_url,
      };
    }),
  );

  // repos
  server.tool(
    'list_repos',
    "Repository list of a user, including private repositories if it's the authenticated user.",
    {
      username,
      sort: z
        .enum(['updated', 'pushed', 'created', 'full_name'])
        .default('pushed')
        .describe('Sorting'),
      limit: limit(20),
    },
    safe(async ({ username: u, sort, limit: n }) => {
      const user = await resolveUser(u);
      const me = await authedLogin();
      const { data } =
        user.toLowerCase() === me.toLowerCase()
          ? await octokit.rest.repos.listForAuthenticatedUser({
              sort,
              per_page: n,
              affiliation: 'owner',
            })
          : await octokit.rest.repos.listForUser({
              username: user,
              sort,
              per_page: n,
              type: 'owner',
            });
      return data.map((r) => ({
        name: r.full_name,
        description: r.description,
        language: r.language,
        stars: r.stargazers_count,
        private: r.private,
        pushedAt: r.pushed_at,
        url: r.html_url,
      }));
    }),
  );

  // recent activity (push, PR, issue, etc.)
  server.tool(
    'recent_activity',
    'Recent activities: pushes, commits, PRs, issues, and branch creations within the last ~90 days.',
    { username, limit: limit(30) },
    safe(async ({ username: u, limit: n }) => {
      const user = await resolveUser(u);
      const { data } =
        await octokit.rest.activity.listEventsForAuthenticatedUser({
          username: user,
          per_page: n,
        });
      return data.map(summarizeEvent);
    }),
  );

  // activity summary for last N days
  server.tool(
    'activity_summary',
    'Fetches summary and repository-wise breakdown of pushes, commits, prs, and issues for the last n days.',
    {
      username,
      days: z.number().int().min(1).max(90).default(7).describe('How long?'),
    },
    safe(async ({ username: u, days }) => {
      const user = await resolveUser(u);
      const since = Date.now() - days * 86_400_000;
      const events: any[] = [];
      for (let page = 1; page <= 3; page++) {
        const { data } =
          await octokit.rest.activity.listEventsForAuthenticatedUser({
            username: user,
            per_page: 100,
            page,
          });
        events.push(...data);
        if (data.length < 100) break;
      }
      const recent = events.filter(
        (e) => e.created_at && new Date(e.created_at).getTime() >= since,
      );

      const byRepo: Record<string, { pushes: number; commits: number }> = {};
      let pushes = 0,
        commits = 0,
        prs = 0,
        issues = 0;
      for (const e of recent) {
        const repo = e.repo?.name ?? 'unknown';
        if (e.type === 'PushEvent') {
          const c = e.payload?.size ?? e.payload?.commits?.length ?? 0;
          pushes++;
          commits += c;
          byRepo[repo] ??= { pushes: 0, commits: 0 };
          byRepo[repo].pushes++;
          byRepo[repo].commits += c;
        } else if (e.type === 'PullRequestEvent') prs++;
        else if (e.type === 'IssuesEvent') issues++;
      }
      return {
        user,
        days,
        totals: {
          pushes,
          commits,
          pullRequestEvents: prs,
          issueEvents: issues,
        },
        byRepo,
      };
    }),
  );

  // commits of a repo
  server.tool(
    'recent_commits',
    'Latest commits of a repository.',
    {
      repo: z.string().describe('Repo name, For example: my-project'),
      owner,
      author: z.string().optional().describe('Filter by author login'),
      since: z
        .string()
        .optional()
        .describe('ISO Date, For example 2025-01-01T00:00:00Z'),
      limit: limit(15),
    },
    safe(async ({ repo, owner: o, author, since, limit: n }) => {
      const ownerName = await resolveUser(o);
      const { data } = await octokit.rest.repos.listCommits({
        owner: ownerName,
        repo,
        author,
        since,
        per_page: n,
      });
      return data.map((c) => ({
        sha: c.sha.slice(0, 7),
        message: c.commit.message.split('\n')[0],
        author: c.author?.login ?? c.commit.author?.name,
        date: c.commit.author?.date,
        url: c.html_url,
      }));
    }),
  );

  // repo summary
  server.tool(
    'repo_summary',
    'A full overview of a repository: info, languages, and latest commit.',
    { repo: z.string(), owner },
    safe(async ({ repo, owner: o }) => {
      const ownerName = await resolveUser(o);
      const [info, langs, commits] = await Promise.all([
        octokit.rest.repos.get({ owner: ownerName, repo }),
        octokit.rest.repos.listLanguages({ owner: ownerName, repo }),
        octokit.rest.repos.listCommits({
          owner: ownerName,
          repo,
          per_page: 5,
        }),
      ]);
      return {
        name: info.data.full_name,
        description: info.data.description,
        defaultBranch: info.data.default_branch,
        stars: info.data.stargazers_count,
        forks: info.data.forks_count,
        openIssues: info.data.open_issues_count,
        pushedAt: info.data.pushed_at,
        languages: langs.data,
        latestCommits: commits.data.map((c) => ({
          sha: c.sha.slice(0, 7),
          message: c.commit.message.split('\n')[0],
          date: c.commit.author?.date,
        })),
      };
    }),
  );

  // pull requests
  server.tool(
    'list_pull_requests',
    'Fetches pull request list for a repository.',
    {
      repo: z.string(),
      owner,
      state: z.enum(['open', 'closed', 'all']).default('open'),
      limit: limit(15),
    },
    safe(async ({ repo, owner: o, state, limit: n }) => {
      const ownerName = await resolveUser(o);
      const { data } = await octokit.rest.pulls.list({
        owner: ownerName,
        repo,
        state,
        per_page: n,
      });
      return data.map((pr) => ({
        number: pr.number,
        title: pr.title,
        state: pr.state,
        author: pr.user?.login,
        createdAt: pr.created_at,
        mergedAt: pr.merged_at,
        url: pr.html_url,
      }));
    }),
  );

  // issues
  server.tool(
    'list_issues',
    'Fetches issue list for a repository excluding pull requests.',
    {
      repo: z.string(),
      owner,
      state: z.enum(['open', 'closed', 'all']).default('open'),
      limit: limit(15),
    },
    safe(async ({ repo, owner: o, state, limit: n }) => {
      const ownerName = await resolveUser(o);
      const { data } = await octokit.rest.issues.listForRepo({
        owner: ownerName,
        repo,
        state,
        per_page: n,
      });
      return data
        .filter((i) => !i.pull_request)
        .map((i) => ({
          number: i.number,
          title: i.title,
          state: i.state,
          labels: i.labels.map((l) => (typeof l === 'string' ? l : l.name)),
          createdAt: i.created_at,
          url: i.html_url,
        }));
    }),
  );

  // open work across all repos
  server.tool(
    'my_open_work',
    'Fetches open pull requests and issues across all repositories.',
    { username, limit: limit(30) },
    safe(async ({ username: u, limit: n }) => {
      const user = await resolveUser(u);
      const { data } = await octokit.rest.search.issuesAndPullRequests({
        q: `author:${user} state:open archived:false`,
        sort: 'updated',
        per_page: n,
      });
      return data.items.map((i) => ({
        type: i.pull_request ? 'PR' : 'Issue',
        title: i.title,
        repo: i.repository_url.replace('https://api.github.com/repos/', ''),
        number: i.number,
        updatedAt: i.updated_at,
        url: i.html_url,
      }));
    }),
  );
}
