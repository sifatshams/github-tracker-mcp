import { Octokit } from '@octokit/rest';
import 'dotenv/config';

const token = process.env.GITHUB_TOKEN;

if (!token) {
  console.error('GITHUB_TOKEN environment variable is required.');
  process.exit(1);
}

export const octokit = new Octokit({
  auth: token,
  userAgent: 'github-tracker-mcp/1.0.0',
});

let cachedLogin: string | undefined;

// username of token owner (cache)
export async function authedLogin(): Promise<string> {
  if (!cachedLogin) {
    const { data } = await octokit.rest.users.getAuthenticated();
    cachedLogin = data.login;
  }
  return cachedLogin;
}

export async function resolveUser(username?: string): Promise<string> {
  if (username) return username;
  if (process.env.GITHUB_USERNAME) return process.env.GITHUB_USERNAME;
  return authedLogin();
}
