import { TOOL_SET } from "./server.js";

    const expected = [
  "discord_health_check",
  "discord_open",
  "discord_get_state",
  "discord_open_channel",
  "discord_extract_visible_messages"
];
    const names = TOOL_SET.map((tool) => tool.name);
    const missing = expected.filter((name) => !names.includes(name));

    if (missing.length > 0) {
      console.error(JSON.stringify({ ok: false, missing, names }, null, 2));
      process.exit(1);
    }

    console.log(JSON.stringify({ ok: true, toolCount: names.length, toolNames: names }, null, 2));
