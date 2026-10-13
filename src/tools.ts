import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { octokit, authedLogin, resolveUser } from "./github.js";

const username = z
  .string()
  .optional()
  .describe("GitHub username. Default: token er owner");
const owner = z
  .string()
  .optional()
  .describe("Repo owner. Default: tomar nijer username");
const limit = (def: number) =>
  z.number().int().min(1).max(100).default(def).describe("Max result");

// convert result to mcp response format
function ok(data:unknown) {
    return {
        content: [
            {type: 'text' as const, text: JSON.stringify(data, null, 2)}
        ]
    }
}

// returns the error message to claude instead of crashing
function safe<T>(fn: (args: T) => Promise<unknown>) {
    return async (args: T) => {
      try {
        return ok(await fn(args));
      } catch (e: any) {
        return {
          isError: true,
          content: [
            { type: "text" as const, text: `GitHub error: ${e.message ?? e}` },
          ],
        };
      }
    };
  }

// formats github events into a short, readable string
function summarizeEvent(e: any) {
    const base = { type: e.type, repo: e.repo?.name, at: e.created_at };
    const p = e.payload ?? {};
    switch (e.type) {
      case "PushEvent":
        return {
          ...base,
          branch: p.ref?.replace("refs/heads/", ""),
          commitCount: p.size ?? p.commits?.length ?? 0,
          commits: p.commits?.map((c: any) => ({
            sha: c.sha.slice(0, 7),
            message: c.message.split("\n")[0],
          })),
        };
      case "PullRequestEvent":
        return {
          ...base,
          action: p.action,
          number: p.pull_request?.number,
          title: p.pull_request?.title,
          merged: p.pull_request?.merged,
        };
      case "IssuesEvent":
        return {
          ...base,
          action: p.action,
          number: p.issue?.number,
          title: p.issue?.title,
        };
      case "CreateEvent":
      case "DeleteEvent":
        return { ...base, refType: p.ref_type, ref: p.ref };
      case "IssueCommentEvent":
      case "PullRequestReviewEvent":
        return { ...base, action: p.action };
      default:
        return base;
    }
  }

  export function registerTools(server: McpServer) {
    // profile
    server.tool(
      "get_profile",
      "GitHub profile info: bio, followers, public repo count, etc.",
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
      })
    );
}