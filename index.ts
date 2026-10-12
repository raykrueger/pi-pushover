/**
 * Pushover Notify Tools
 *
 * Two tools:
 * - pushover_notify: Send a push notification (use when user says "ping me", "notify me")
 * - pushover_configure: Set or update Pushover credentials (use when config is missing or user asks)
 *
 * Config: pushover.json in the agent directory (~/.pi/agent, or $PI_CODING_AGENT_DIR)
 *   { "token": "<app-token>", "user": "<user-key>" }
 */

import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

const AGENT_DIR = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
const CONFIG_PATH = join(AGENT_DIR, "pushover.json");

function readConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return null;
  }
}

function writeConfig(config: { token: string; user: string }) {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
  // mode only applies on creation; tighten existing files too
  chmodSync(CONFIG_PATH, 0o600);
}

/** Format a failed Pushover API response for the user, including the human-readable error message. */
async function formatApiError(res: Response): Promise<string> {
  let detail = `HTTP ${res.status}`;
  try {
    const body = await res.json();
    if (typeof body?.message === "string" && body.message) {
      detail += `: ${body.message}`;
    }
  } catch {
    // non-JSON body; status code alone is fine
  }
  return detail;
}

/**
 * pushover_notify — Send a push notification.
 *
 * When to use — ONLY when the user requests a push:
 * - User says "ping me", "notify me", "send me a notification"
 * - User asked beforehand to be notified when a specific task/operation finishes
 *
 * Do NOT send unsolicited pushes (e.g. just because a task finished).
 * Do NOT use for configuration. Call pushover_configure instead if credentials are missing.
 */
const pushoverNotifyTool = defineTool({
  name: "pushover_notify",
  label: "Pushover Notify",
  description:
    "Send a Pushover push notification to the user. ONLY call this when the user has " +
    'explicitly asked to be notified: the user says "ping me", "notify me", "send me a ' +
    'notification", or asked in advance to be alerted when a specific task or operation finishes. ' +
    "Do not send pushes that were not requested by the user. " +
    "Keep the message short and informative. Lead with 1-2 emojis matching the context: " +
    "✅🎉 success, ❌💥 failure, ⚠️🔍 warning, 🚀📦 deploy, 🔧🛠️ fix, 📊📈 data, ⏳🔄 in progress, 💡📝 info. " +
    "If this tool returns a configuration error, call pushover_configure first.",
  parameters: Type.Object({
    message: Type.String({
      description:
        "Notification message. First line: emoji + one-liner summary. " +
        "Optional second line: key detail. Keep it concise.",
    }),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
    const config = readConfig();
    if (!config?.token || !config?.user) {
      return {
        content: [
          {
            type: "text",
            text: "ERROR: Pushover not configured. Use pushover_configure to set credentials.",
          },
        ],
        details: {},
      };
    }

    const res = await fetch("https://api.pushover.net/1/messages.json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: config.token,
        user: config.user,
        message: params.message,
      }),
    });

    if (!res.ok) {
      return {
        content: [
          {
            type: "text",
            text: `ERROR: Pushover API returned ${await formatApiError(res)}`,
          },
        ],
        details: {},
      };
    }

    return {
      content: [{ type: "text", text: "Notification sent successfully." }],
      details: {},
    };
  },
});

/**
 * pushover_configure — Set or update Pushover credentials.
 *
 * When to use — ONLY when explicitly needed or requested:
 * - pushover_notify returns a configuration error
 * - User asks to configure or reconfigure Pushover
 * - User provides new credentials
 *
 * Do NOT use just to send a notification. Use pushover_notify for that.
 */
const pushoverConfigureTool = defineTool({
  name: "pushover_configure",
  label: "Pushover Configure",
  description:
    "Set or update Pushover API credentials. ONLY call when pushover_notify reports a " +
    "configuration error, or when the user explicitly asks to configure Pushover. " +
    "Requires both token and user key. " +
    'Token: Pushover app API token (from pushover.net → Your Applications). ' +
    'User: Pushover user key (from pushover.net dashboard, top of page).',
  parameters: Type.Object({
    token: Type.String({
      description: "Pushover app API token (from pushover.net → Your Applications)",
    }),
    user: Type.String({
      description: "Pushover user key (from pushover.net dashboard, top of page)",
    }),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
    try {
      writeConfig({ token: params.token, user: params.user });

      // Test the credentials with a quick notification
      const res = await fetch("https://api.pushover.net/1/messages.json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: params.token,
          user: params.user,
          message: "✅ Pushover configured",
        }),
      });

      if (!res.ok) {
        return {
          content: [
            {
              type: "text",
              text: `ERROR: Credentials saved but test notification failed (${await formatApiError(res)}). Check token and user key.`,
            },
          ],
          details: {},
        };
      }

      return {
        content: [
          {
            type: "text",
            text: "Pushover configured. Test notification sent successfully.",
          },
        ],
        details: {},
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `ERROR: Failed to save config: ${err instanceof Error ? err.message : err}`,
          },
        ],
        details: {},
      };
    }
  },
});

export default function (pi: ExtensionAPI) {
  pi.registerTool(pushoverNotifyTool);
  pi.registerTool(pushoverConfigureTool);
}
