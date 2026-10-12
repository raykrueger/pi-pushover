# pi-pushover

You kick off a long task in [pi](https://pi.dev) and step away — then have to come back and check whether it's done. `pi-pushover` adds a `pushover_notify` tool so pi can send you a Pushover notification on your phone or desktop the moment something needs you.

It registers two tools with the pi coding agent:

| Tool | What it does |
|---|---|
| `pushover_notify` | Sends a short push notification. Pi is instructed to only call it when you explicitly ask to be notified ("ping me", "notify me", or a standing instruction like "alert me when the deploy finishes"). |
| `pushover_configure` | Stores your Pushover app token and user key, then verifies them by sending a test push. |

No other dependencies — notifications go out with the built-in `fetch` against the Pushover API.

## Installation

Prerequisite: the pi coding agent, and a free [Pushover](https://pushover.net) account with an app token and user key.

Install from git (once the repo has a remote):

```sh
pi install git:github.com/<you>/pi-pushover@v1.0.0
```

Or install this local checkout directly:

```sh
pi install /path/to/pi-pushover
```

Then run `/reload` in pi (or restart) and tell it to set up credentials:

```
Configure Pushover with token <app-token> and user key <user-key>
```

pi calls `pushover_configure`, which saves the credentials to `~/.pi/agent/pushover.json` (mode `0600`, outside the package directory so package updates never touch them) and sends a test notification.

## Quick start

Once configured, just ask for a notification:

```
Rebuild the test suite and ping me when it's done
```

When the work finishes, you get a push like:

```
✅ Tests passed
1247 passed, 0 failed in 3m12s
```

A standing instruction also works — put "notify me when a long task finishes" in your `AGENTS.md` and pi will send the push without being reminded each time.

## Usage rules

The tool descriptions carry usage policy so pi doesn't spam you:

- `pushover_notify` fires **only** for requested notifications — an explicit ask or a pre-agreed trigger. No unsolicited pushes.
- Messages are short and informative, led by 1–2 context-appropriate emoji (✅ 🎉 success, ❌ 💥 failure, ⚠️ warning, 🚀 deploy, 🔧 fix, 📊 data, ⏳ in progress).
- If credentials are missing, `pushover_notify` returns a configuration error and pi should switch to `pushover_configure` instead of failing silently.

## Configuration

`~/.pi/agent/pushover.json` (honors `PI_CODING_AGENT_DIR`):

```json
{
  "token": "<pushover app token>",
  "user": "<pushover user key>"
}
```

Get the app token from [Pushover → Your Applications](https://pushover.net/apps) and the user key from your [Pushover dashboard](https://pushover.net). Deleting the file is equivalent to uninstalling configuration; the next `pushover_notify` will ask to reconfigure.

## Development

The extension is a single TypeScript file loaded directly by pi — no build step. Runtime requirements:

- Node ≥ 22 (TypeScript type stripping)
- pi host packages `@earendil-works/pi-ai` and `@earendil-works/pi-coding-agent`, provided by pi itself and declared as `peerDependencies` — never bundle them.

Local development loop: edit `index.ts`, run `/reload` in a pi session, and exercise the tools.

## License

TODO — choose and add a `LICENSE` before publishing.
