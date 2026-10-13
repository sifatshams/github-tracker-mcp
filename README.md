# github-tracker-mcp

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that lets an AI assistant such as Claude see and summarize your GitHub activity: commits, pushes, pull requests, issues and repositories.

Once connected, you can ask things like:

- "What did I commit this week?"
- "Which repos did I push to in the last 30 days?"
- "Show the last 10 commits in `my-project`."
- "Do I have any open pull requests?"

The assistant answers using live data from your own GitHub account.

---

## Table of contents

1. [How it works](#how-it-works)
2. [Features](#features)
3. [Requirements](#requirements)
4. [Installation](#installation)
5. [Create a GitHub token](#create-a-github-token)
6. [Configuration](#configuration)
7. [Run and test in the browser (MCP Inspector)](#run-and-test-in-the-browser-mcp-inspector)
8. [Connect to an AI app](#connect-to-an-ai-app)
9. [Available tools](#available-tools)
10. [Example prompts](#example-prompts)
11. [Scripts](#scripts)
12. [Project structure](#project-structure)
13. [Adding your own tool](#adding-your-own-tool)
14. [Limitations](#limitations)
15. [Troubleshooting](#troubleshooting)
16. [Security](#security)
17. [Contributing](#contributing)
18. [License](#license)

---

## How it works

An AI model does not know you or your GitHub account. This project is the bridge between the two.

```
AI app (MCP client)  <--stdio-->  github-tracker-mcp  <--HTTPS-->  GitHub API
 e.g. Claude Desktop               (runs on your PC,                 (your data)
                                    holds your token)
```

1. You ask your AI app a question about your GitHub work.
2. The AI reads the list of tools this server offers and picks the right one.
3. The AI app starts this server on your machine and sends it the request over **stdio** (standard input/output).
4. The server calls the GitHub API with **your** token and returns the data as JSON.
5. The AI reads that JSON and answers in plain language.

Important points:

- The server runs **locally on your computer**. Your token never leaves your machine, except in requests to `api.github.com`.
- The server is **read-only**. It never creates, edits or deletes anything on GitHub.
- You do not start the server yourself in daily use. The AI app starts and stops it automatically.
- Because it uses stdio, it works with apps installed on your computer (Claude Desktop, Claude Code, Cursor, etc.). It does **not** work directly with web or mobile chat apps.

---

## Features

- Profile information (bio, followers, public repo count)
- Repository list (private repos included for your own account)
- Recent activity: pushes, commits, PRs, issues, branch creation
- Activity summary for the last N days with a per-repo breakdown
- Latest commits, PRs and issues of any repository
- Open PRs and issues across all your repositories
- Errors are returned as readable messages instead of crashing the server

---

## Requirements

- **Node.js 20.6 or newer** (`node -v` to check)
- **Yarn** (classic, v1.x) (`yarn -v` to check). Install with `npm install -g yarn` if missing.
- A **GitHub Personal Access Token** (see below)
- An **MCP client**, for example Claude Desktop or Claude Code

---

## Installation

```bash
git clone https://github.com/<your-username>/github-tracker-mcp.git
cd github-tracker-mcp
yarn install
yarn build
```

`yarn build` compiles the TypeScript in `src/` into JavaScript in `build/`. Run it again every time you change the code.

---

## Create a GitHub token

1. Open GitHub, then **Settings → Developer settings → Personal access tokens**.
2. Choose one of the following.

**Fine-grained token (recommended)**

- Direct link: https://github.com/settings/personal-access-tokens
- Click **Generate new token**.
- **Repository access:** all repositories (or only the ones you want tracked).
- **Repository permissions** (all **Read-only**): Metadata, Contents, Pull requests, Issues.

**Classic token**

- Direct link: https://github.com/settings/tokens
- Select the `repo` scope (needed for private repos) and `read:user`.
- For public data only, no scope is needed.

3. Copy the token right away. GitHub shows it only once.

> If `recent_activity` or `activity_summary` return empty results with a fine-grained token, try a classic token. GitHub's activity events can be limited for some fine-grained token setups, especially for private activity.

---

## Configuration

The server reads two environment variables:

| Variable          | Required | Description                                                |
| ----------------- | -------- | ---------------------------------------------------------- |
| `GITHUB_TOKEN`    | Yes      | Your GitHub personal access token                          |
| `GITHUB_USERNAME` | No       | Default username. If empty, the owner of the token is used |

For local development and testing, copy the example file and fill it in:

```bash
cp .env.example .env
```

(Windows PowerShell: `copy .env.example .env`)

```
GITHUB_TOKEN=ghp_your_token_here
GITHUB_USERNAME=your-username
```

`.env` is listed in `.gitignore`, so it is never committed. When you connect the server to an AI app, you pass these variables in the app's config instead (see below).

---

## Run and test in the browser (MCP Inspector)

Before connecting an AI app, test the server in your browser with the official **MCP Inspector**. It gives you a web UI where you can run every tool by hand.

1. Build the project (once, and after every code change):

```bash
   yarn build
```

2. Make sure `.env` contains your token, then start the Inspector:

```bash
   yarn inspect
```

3. The terminal prints a local link similar to `http://127.0.0.1:6274/?MCP_INSPECTOR_API_TOKEN=...`. Your browser usually opens it automatically. If not, copy the link into your browser.

4. In the UI:
   - Click **Connect**. The status should turn green (**Connected**).
   - Open the **Tools** tab and click **List Tools**. You should see all 9 tools.
   - Select `get_profile` and click **Execute Tool**. Leave `username` empty to use your own account. Your profile data should appear.
   - Try the other tools the same way.

5. Press `Ctrl + C` in the terminal to stop the Inspector.

**About the link:** it points to `127.0.0.1` (your own computer). The `MCP_INSPECTOR_API_TOKEN` is a random session key the Inspector generates for protection and has nothing to do with your GitHub token. Do not share the link. A new one is created each time you start the Inspector.

**If the Inspector shows "GITHUB_TOKEN environment variable is required"**, the token did not reach the server. Pass it directly:

```bash
npx @modelcontextprotocol/inspector -e GITHUB_TOKEN=ghp_your_token_here -e GITHUB_USERNAME=your-username node build/index.js
```

**Run the server directly (optional)**

```bash
yarn start
```

It prints `github-tracker MCP server running on stdio` and then waits silently for MCP messages. This is normal. Stop it with `Ctrl + C`. To run straight from the TypeScript source without building, use `yarn dev`.

> `yarn start` and `yarn dev` need `GITHUB_TOKEN` to be set in your terminal session. On Linux/macOS: `export GITHUB_TOKEN=ghp_xxx`. On Windows PowerShell: `$env:GITHUB_TOKEN="ghp_xxx"`.

---

## Connect to an AI app

In all apps you give the same three things: the **command** (`node`), the **absolute path** to `build/index.js`, and the **environment variables**.

Use an absolute path. On Windows, write it with forward slashes, for example `D:/projects/github-tracker-mcp/build/index.js`.

### Claude Desktop

1. Open **Settings → Developer → Edit Config**, or open the file directly:
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
2. Add the server. If the file already has other servers, add this entry inside the existing `mcpServers` object (separated by a comma) instead of replacing the file.

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

3. **Fully quit** Claude Desktop (on Windows, right-click its icon in the system tray and choose Quit) and open it again.
4. Check that `github-tracker` and its tools appear in the tools menu of the chat box. Claude asks permission the first time it uses a tool. Choose **Allow**.

### Claude Code

```bash
claude mcp add github-tracker \
  -e GITHUB_TOKEN=ghp_your_token_here \
  -e GITHUB_USERNAME=your-username \
  -- node /absolute/path/to/github-tracker-mcp/build/index.js
```

Verify with `claude mcp list`.

### Other apps (Cursor, VS Code, Windsurf, Cline, Gemini CLI, ...)

Most MCP-compatible desktop apps accept the same `command`, `args` and `env` values in their MCP settings. Where that setting lives differs per app, so check the app's own MCP documentation. The JSON block from the Claude Desktop section is the usual format.

### Web and mobile chat apps

This server uses **stdio**, so it can only be started by an app on your own computer. Web and mobile chat apps cannot launch it. Supporting them would require a remote (HTTP) version of the server with authentication, which this project does not include.

---

## Available tools

| Tool                 | Description                                                  | Parameters                                                                |
| -------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `get_profile`        | Profile info: bio, followers, public repo count              | `username` (optional)                                                     |
| `list_repos`         | Repository list. Includes private repos for your own account | `username`, `sort` (`updated`, `pushed`, `created`, `full_name`), `limit` |
| `recent_activity`    | Latest pushes, commits, PRs, issues, branch creations        | `username`, `limit`                                                       |
| `activity_summary`   | Totals for the last N days with a per-repo breakdown         | `username`, `days` (1-90)                                                 |
| `recent_commits`     | Latest commits of a repository                               | `repo`, `owner`, `author`, `since`, `limit`                               |
| `repo_summary`       | Overview of a repo: info, languages, latest commits          | `repo`, `owner`                                                           |
| `list_pull_requests` | Pull requests of a repository                                | `repo`, `owner`, `state` (`open`, `closed`, `all`), `limit`               |
| `list_issues`        | Issues of a repository (pull requests excluded)              | `repo`, `owner`, `state`, `limit`                                         |
| `my_open_work`       | All your open PRs and issues across repositories             | `username`, `limit`                                                       |

Notes:

- `repo` is the repository name only, for example `my-project`, not the full URL.
- `owner` and `username` default to `GITHUB_USERNAME`, or to the token owner if that is not set.
- `since` is an ISO date such as `2026-01-01T00:00:00Z`.

---

## Example prompts

- "Give me an overview of my GitHub profile."
- "What did I work on this week?"
- "Summarize my GitHub activity for the last 30 days, grouped by repo."
- "Show my last 10 commits in `my-project`."
- "Do I have any open pull requests or issues?"
- "Which repository did I push to most recently?"

You do not need to name the tools. The AI picks them itself and may combine several tools to answer one question.

---

## Scripts

| Command        | What it does                                                          |
| -------------- | --------------------------------------------------------------------- |
| `yarn install` | Install dependencies                                                  |
| `yarn build`   | Compile TypeScript from `src/` to `build/`                            |
| `yarn start`   | Run the compiled server (`build/index.js`)                            |
| `yarn dev`     | Run directly from TypeScript with `tsx`, no build needed              |
| `yarn inspect` | Open the MCP Inspector in your browser, using the variables in `.env` |

---

## Project structure

```
github-tracker-mcp/
├── src/
│   ├── index.ts        # Entry point: creates the server and connects stdio
│   ├── github.ts       # Octokit (GitHub API) client and username resolution
│   └── tools.ts        # All MCP tool definitions
├── build/              # Compiled output (generated, not committed)
├── .env.example        # Template for local environment variables
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

---

## Adding your own tool

Open `src/tools.ts` and add a new block inside `registerTools`:

```ts
server.tool(
  'tool_name', // name the AI sees
  'What this tool does.', // description the AI reads to decide when to use it
  { repo: z.string(), owner }, // input parameters (zod schema)
  safe(async ({ repo, owner: o }) => {
    const ownerName = await resolveUser(o);
    const { data } = await octokit.rest.repos.get({ owner: ownerName, repo });
    return { name: data.full_name, stars: data.stargazers_count };
  }),
);
```

Then run `yarn build` and restart your AI app. A clear, specific description helps the AI choose the right tool.

Ideas for extensions: file content reader, commit diff viewer, contribution calendar (GraphQL API), pagination for large result sets.

---

## Limitations

- GitHub's Events API returns only roughly the last **90 days** and up to **300 events**, so `activity_summary` cannot look further back.
- Events can be delayed by a few minutes after a push.
- Commit data contains messages, authors, dates and SHAs. File contents and diffs are not included.
- `recent_commits` returns at most 100 commits per call and has no pagination.
- Subject to GitHub API rate limits (5,000 requests per hour with a token).
- Works only with desktop MCP clients that can start local stdio servers.

---

## Troubleshooting

| Problem                                            | Solution                                                                                                                                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GITHUB_TOKEN environment variable is required`    | The token did not reach the server. In an AI app, add it to the `env` block of the config. In the Inspector, use `.env` with `yarn inspect` or pass `-e GITHUB_TOKEN=...` |
| Tools do not appear in the AI app                  | Check the config JSON for syntax errors (commas, brackets), confirm the path to `build/index.js` is absolute and correct, and fully quit and reopen the app               |
| `spawn node ENOENT`                                | The app cannot find Node. Put the full path to Node in `"command"`, for example `"C:/Program Files/nodejs/node.exe"`                                                      |
| `Cannot find module ... build/index.js`            | You have not built the project. Run `yarn build`                                                                                                                          |
| `Bad credentials`                                  | The token is wrong or expired. Create a new one                                                                                                                           |
| `Not Found`                                        | Wrong repository name, or the token has no access to that private repo                                                                                                    |
| `Resource not accessible by personal access token` | The token is missing a permission (Contents, Pull requests or Issues)                                                                                                     |
| Empty activity results                             | Events can be delayed, only cover the last 90 days, and may be limited for fine-grained tokens. Try a classic token                                                       |
| `--env-file` error                                 | Your Node.js is older than 20.6. Upgrade Node or set `GITHUB_TOKEN` in the terminal manually                                                                              |
| Import errors after editing code                   | Imports in `src/` must end with `.js`, for example `./tools.js`                                                                                                           |

Claude Desktop logs are in `%APPDATA%\Claude\logs\` on Windows and `~/Library/Logs/Claude/` on macOS. Look for `mcp-server-github-tracker.log`.

---

## Security

- The server is **read-only**.
- Never commit your token. `.env` is already in `.gitignore`.
- Use a **fine-grained, read-only token** with the minimum permissions and a short expiry.
- The token you put in an AI app's config file is stored in plain text on your machine. Do not share that file.
- If a token is ever exposed, revoke it immediately at https://github.com/settings/tokens and create a new one.
- Do not expose this server to the public internet without proper authentication.

---

## Contributing

Issues and pull requests are welcome.

1. Fork the repository
2. Create a branch: `git checkout -b feature/my-feature`
3. Make your changes and run `yarn build`
4. Commit and push your branch
5. Open a pull request

---

## License

MIT
