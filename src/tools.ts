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

