# github-tracker-mcp

An MCP (Model Context Protocol) server that lets Claude track your GitHub activity. Ask things like _"What did I commit this week?"_, _"Which repos did I push to today?"_ or _"Show my open PRs"_ and Claude answers using live data from your GitHub account.

## Features

| Tool                 | What it does                                                   |
| -------------------- | -------------------------------------------------------------- |
| `get_profile`        | Profile info: bio, followers, public repo count                |
| `list_repos`         | Your repositories (private ones included for your own account) |
| `recent_activity`    | Latest pushes, commits, PRs, issues, branch creations          |
| `activity_summary`   | Totals for the last N days, with a per-repo breakdown          |
| `recent_commits`     | Latest commits of a repository                                 |
| `repo_summary`       | Overview of a repo: info, languages, latest commits            |
| `list_pull_requests` | Pull requests of a repository                                  |
| `list_issues`        | Issues of a repository                                         |
| `my_open_work`       | All your open PRs and issues across repos                      |

## Requirements

- Node.js 18 or newer
- A GitHub Personal Access Token
- An MCP client (Claude Desktop, Claude Code, etc.)

## Installation

```bash
git clone https://github.com/<your-username>/github-tracker-mcp.git
cd github-tracker-mcp
yarn install
yarn run build
```

## Create a GitHub token

1. Go to GitHub → Settings → Developer settings → Personal access tokens.
2. **Fine-grained token** (recommended): select the repositories you want to track and grant read-only access to _Metadata_, _Contents_, _Pull requests_ and _Issues_.
3. **Classic token**: select the `repo` scope (to include private repos) and `read:user`. For public data only, no scope is needed.

Never commit your token. This repo's `.gitignore` already excludes `.env`.

## Configuration

### Claude Desktop

Edit `claude_desktop_config.json`:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "github-tracker": {
      "command": "node",
      "args": ["/absolute/path/to/github-tracker-mcp/build/index.js"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token_here",
        "GITHUB_USERNAME": "your-username"
      }
    }
  }
}
```

Restart Claude Desktop afterwards.

### Claude Code

```bash
claude mcp add github-tracker \
  -e GITHUB_TOKEN=ghp_your_token_here \
  -- node /absolute/path/to/github-tracker-mcp/build/index.js
```

## Environment variables

| Variable          | Required | Description                                     |
| ----------------- | -------- | ----------------------------------------------- |
| `GITHUB_TOKEN`    | Yes      | Your GitHub personal access token               |
| `GITHUB_USERNAME` | No       | Default username. Falls back to the token owner |

## Example prompts

- "What did I work on this week?"
- "Summarize my GitHub activity for the last 30 days."
- "Show my last 10 commits in `my-project`."
- "Do I have any open pull requests?"
- "Give me an overview of the `my-project` repo."

## Development

```bash
cp .env.example .env     # then fill in your token
yarn run dev              # run with tsx, no build needed
```

Test with the MCP Inspector:

```bash
GITHUB_TOKEN=ghp_xxx npx @modelcontextprotocol/inspector node build/index.js
```

## Project structure

```
src/
├── index.ts    # Server entry point (stdio transport)
├── github.ts   # Octokit client and user resolution
└── tools.ts    # All MCP tool definitions
```

To add a new tool, register it in `src/tools.ts` with `server.tool(name, description, zodSchema, handler)`, then rebuild.

## Limitations

- GitHub's Events API only returns roughly the last 90 days and up to 300 events, so `activity_summary` cannot look further back.
- Events can be delayed by a few minutes.
- Subject to GitHub API rate limits (5,000 requests/hour with a token).

## Security

The server is read-only: it never creates, edits or deletes anything on GitHub. Keep your token private and use a fine-grained token with minimal permissions.

## License

MIT
