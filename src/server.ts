import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { daemonHealth } from "./connection.js";
import { extractChannels, extractThreads, extractVisibleMessages, getSiteState, openSite } from "./site.js";
import type { ToolDefinition } from "./types.js";
import { asObject, asOptionalNumber, asOptionalString, errorResult, textResult } from "./types.js";

export const TOOL_SET: ToolDefinition[] = [
  {
    name: "discord_health_check",
    description: "Check the SurfAgent daemon and basic Discord adapter availability.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async () => textResult(JSON.stringify(await daemonHealth(), null, 2)),
  },
  {
    name: "discord_open",
    description: "Open Discord in the SurfAgent managed browser.",
    inputSchema: { type: "object", properties: { path: { type: "string" } }, additionalProperties: false },
    handler: async (args) => {
      const input = asObject(args, "discord_open arguments");
      return textResult(JSON.stringify(await openSite(asOptionalString(input.path)), null, 2));
    },
  },
  {
    name: "discord_get_state",
    description: "Inspect the current Discord page state, including route kind, login requirement, and major pane presence.",
    inputSchema: { type: "object", properties: { tabId: { type: "string" } }, additionalProperties: false },
    handler: async (args) => {
      const input = asObject(args, "discord_get_state arguments");
      return textResult(JSON.stringify(await getSiteState(asOptionalString(input.tabId)), null, 2));
    },
  },
  {
    name: "discord_open_channel",
    description: "Open a Discord channel or message URL/path.",
    inputSchema: { type: "object", properties: { path: { type: "string" } }, additionalProperties: false },
    handler: async (args) => {
      const input = asObject(args, "discord_open_channel arguments");
      return textResult(JSON.stringify(await openSite(asOptionalString(input.path)), null, 2));
    },
  },
  {
    name: "discord_extract_visible_messages",
    description: "Extract currently visible Discord messages with structured metadata from the active view.",
    inputSchema: { type: "object", properties: { limit: { type: "number" }, tabId: { type: "string" } }, additionalProperties: false },
    handler: async (args) => {
      const input = asObject(args, "discord_extract_visible_messages arguments");
      return textResult(JSON.stringify(await extractVisibleMessages(asOptionalNumber(input.limit) ?? 10, asOptionalString(input.tabId)), null, 2));
    },
  },
  {
    name: "discord_extract_channels",
    description: "Extract visible Discord channels from the current guild/sidebar.",
    inputSchema: { type: "object", properties: { limit: { type: "number" }, tabId: { type: "string" } }, additionalProperties: false },
    handler: async (args) => {
      const input = asObject(args, "discord_extract_channels arguments");
      return textResult(JSON.stringify(await extractChannels(asOptionalNumber(input.limit) ?? 25, asOptionalString(input.tabId)), null, 2));
    },
  },
  {
    name: "discord_extract_threads",
    description: "Extract visible Discord thread/forum rows from the current view when present.",
    inputSchema: { type: "object", properties: { limit: { type: "number" }, tabId: { type: "string" } }, additionalProperties: false },
    handler: async (args) => {
      const input = asObject(args, "discord_extract_threads arguments");
      return textResult(JSON.stringify(await extractThreads(asOptionalNumber(input.limit) ?? 25, asOptionalString(input.tabId)), null, 2));
    },
  },
];

export function createServer(): Server {
  const server = new Server(
    { name: "surfagent-discord", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_SET.map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = TOOL_SET.find((t) => t.name === request.params.name);
    if (!tool) {
      return { isError: true, content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }] };
    }
    try {
      return await tool.handler(request.params.arguments ?? {});
    } catch (error) {
      return errorResult(error);
    }
  });

  return server;
}
