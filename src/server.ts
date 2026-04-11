import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { daemonHealth } from "./connection.js";
import { extractChannels, extractThreads, extractVisibleMessages, getSiteState, openChannelByTitle, openSite } from "./site.js";
import { runCheckStateTask, runOpenChannelByTitleTask } from "./task-runner.js";
import type { ToolDefinition } from "./types.js";
import { asObject, asOptionalBoolean, asOptionalNumber, asOptionalString, errorResult, textResult } from "./types.js";

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
  {
    name: "discord_open_channel_by_title",
    description: "Open a visible Discord channel by its title/name and verify the selected channel surface.",
    inputSchema: {
      type: "object",
      properties: { title: { type: "string" }, exact: { type: "boolean" }, path: { type: "string" }, tabId: { type: "string" }, limit: { type: "number" } },
      required: ["title"],
      additionalProperties: false,
    },
    handler: async (args) => {
      const input = asObject(args, "discord_open_channel_by_title arguments");
      return textResult(JSON.stringify(await openChannelByTitle(asOptionalString(input.title) ?? "", {
        exact: asOptionalBoolean(input.exact),
        path: asOptionalString(input.path),
        tabId: asOptionalString(input.tabId),
        limit: asOptionalNumber(input.limit),
      }), null, 2));
    },
  },
  {
    name: "discord_check_state_task",
    description: "Deterministic Discord task that opens Discord, captures proof artifacts, classifies the visible surface, and reports the next best action.",
    inputSchema: { type: "object", properties: { path: { type: "string" } }, additionalProperties: false },
    handler: async (args) => {
      const input = asObject(args, "discord_check_state_task arguments");
      return textResult(JSON.stringify(await runCheckStateTask({ path: asOptionalString(input.path) }), null, 2));
    },
  },
  {
    name: "discord_open_channel_by_title_task",
    description: "Deterministic Discord task that finds a visible channel by title, opens it, captures proof artifacts, and verifies the selected channel.",
    inputSchema: {
      type: "object",
      properties: { title: { type: "string" }, exact: { type: "boolean" }, path: { type: "string" }, limit: { type: "number" } },
      required: ["title"],
      additionalProperties: false,
    },
    handler: async (args) => {
      const input = asObject(args, "discord_open_channel_by_title_task arguments");
      return textResult(JSON.stringify(await runOpenChannelByTitleTask({
        title: asOptionalString(input.title) ?? "",
        exact: asOptionalBoolean(input.exact),
        path: asOptionalString(input.path),
        limit: asOptionalNumber(input.limit),
      }), null, 2));
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
