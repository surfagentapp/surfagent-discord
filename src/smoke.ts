import { TOOL_SET, createServer } from "./server.js";

const expected = [
  "discord_health_check",
  "discord_open",
  "discord_get_state",
  "discord_open_channel",
  "discord_extract_visible_messages",
  "discord_extract_channels",
  "discord_extract_threads",
  "discord_open_thread_by_title",
  "discord_open_channel_by_title",
  "discord_get_composer_state",
  "discord_fill_composer_draft",
  "discord_send_current_message",
  "discord_check_state_task",
  "discord_open_channel_by_title_task",
  "discord_open_channel_and_summarize_task",
  "discord_open_thread_and_summarize_task",
  "discord_open_channel_and_send_message_task",
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const names = TOOL_SET.map((tool) => tool.name);
const uniqueNames = new Set(names);
const missing = expected.filter((name) => !names.includes(name));

assert(names.length === uniqueNames.size, "Duplicate tool names detected.");
assert(missing.length === 0, `Missing expected tools: ${missing.join(", ")}`);

for (const tool of TOOL_SET) {
  assert(typeof tool.description === "string" && tool.description.trim().length > 0, `Tool ${tool.name} is missing a description.`);
  assert(tool.inputSchema?.type === "object", `Tool ${tool.name} must expose an object input schema.`);
  assert(typeof tool.handler === "function", `Tool ${tool.name} is missing a handler.`);
}

const server = createServer();
assert(!!server, "Failed to create MCP server instance.");

console.log(JSON.stringify({ ok: true, toolCount: names.length, toolNames: names }, null, 2));
