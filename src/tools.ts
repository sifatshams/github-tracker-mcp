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

