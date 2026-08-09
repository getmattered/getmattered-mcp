# AI Applyd MCP Server

AI Applyd MCP Server provides ATS resume scoring, interview prep, resume optimization, cover letters, job search, and auto-apply tools for AI assistants. Connect any MCP-compatible client (Claude, ChatGPT connectors, Cursor) to get AI-powered career tools directly in your workflow.

Public listing page: **https://aiapplyd.com/mcps**

## Canonical Endpoints

| Environment | Base URL | Streamable HTTP (modern) | SSE (legacy) |
|-------------|----------|--------------------------|--------------|
| Production | `https://mcp.aiapplyd.com` | `https://mcp.aiapplyd.com/mcp` | `https://mcp.aiapplyd.com/sse` |
| Preview | `https://mcp-preview.aiapplyd.com` | `https://mcp-preview.aiapplyd.com/mcp` | `https://mcp-preview.aiapplyd.com/sse` |

**Use `/mcp` (Streamable HTTP) for modern clients.** Use `/sse` only for legacy clients that cannot speak Streamable HTTP - typically via the `mcp-remote` bridge.

## Tools, Tiers & Funnel

**There is no free tier and no anonymous tool.** Every tool requires a connected AI Applyd account, and every tool is metered against that user's own plan and paid for with their own AI credits. The API enforces this on every call (`requireActionAllowed` → `requireAIPrerequisites` → `incrementActionUsage` / `reserveUserTokens`); the MCP server holds no allowance of its own.

| Tool | Tier | Description |
|------|------|-------------|
| `aiapplyd_score_resume` | Connected | ATS scoring with section-by-section feedback and missing keywords |
| `aiapplyd_analyze_job_description` | Connected | Extract the ATS keywords and requirements a posting screens on |
| `aiapplyd_optimize_resume` | Connected | Rewrite a resume for a better ATS match against a job |
| `aiapplyd_generate_interview_questions` | Connected | Company-specific interview questions with answer guidance |
| `aiapplyd_translate_resume` | Connected | Resume translation to another language |
| `aiapplyd_search_jobs` | Connected | Search your curated job matches (**read-only**) |
| `aiapplyd_update_job_preferences` | Connected | Change which roles/locations AI Applyd hunts for (**destructive**) |
| `aiapplyd_generate_cover_letter` | Paid | Cover letter for a job, written from the resume on your account |
| `aiapplyd_auto_apply` | Paid | Apply to **one specific** job posting |
| `aiapplyd_build_pdf` | Paid | Create a formatted resume in the builder, ready to download |

Also exposed: **3 prompts** (`review_my_resume`, `prepare_for_interview`, `find_jobs_like_this`) and **3 resources** (`ats-best-practices`, `interview-frameworks`, `resume-section-order`).

**The funnel:**
1. **Connect** - sign in with Google once (a free AI Applyd account, no card). New accounts receive a one-time 10,000-token starter grant, which is what the first tool calls draw from.
2. **Use** - every tool spends that balance, exactly as the dashboard does.
3. **Upgrade** - when credits run low, tools return an upsell to **continue in the dashboard at https://aiapplyd.com** (carrying per-client UTM attribution, so we can see which assistant drives signups).

### Two behaviours worth knowing

- `aiapplyd_search_jobs` is **read-only**. It never rewrites your saved preferences. To change what AI Applyd hunts for, call `aiapplyd_update_job_preferences` — which is annotated `destructiveHint: true` because a supplied list *replaces* the stored one.
- `aiapplyd_auto_apply` applies to the **one job URL you give it**, and follows the review setting already on your account (auto-approve submits on its own; copilot routes it to your review queue). It never changes that setting.

## Connect from Claude (web + Desktop + Code)

AI Applyd is a **remote MCP server**. The modern path is the built-in custom connector with OAuth - no local bridge needed.

### Claude web / Claude Desktop (custom connector)

1. Open **Settings → Connectors → Add custom connector**.
2. Name: `AI Applyd`.
3. Remote MCP server URL: `https://mcp.aiapplyd.com/mcp`
4. Save. The first tool call opens the OAuth flow - **sign in with Google** (a free account is enough for the no-credit tools) and the token is picked up automatically.

If your Claude build does not yet support Streamable HTTP custom connectors, use the legacy `mcp-remote` bridge in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ai-applyd": {
      "command": "npx",
      "args": ["mcp-remote", "https://mcp.aiapplyd.com/sse"]
    }
  }
}
```

### Claude Code

Add the remote server (Streamable HTTP, recommended):

```bash
claude mcp add --transport http ai-applyd https://mcp.aiapplyd.com/mcp
```

Or via `.claude/settings.json` using the legacy bridge:

```json
{
  "mcpServers": {
    "ai-applyd": {
      "command": "npx",
      "args": ["mcp-remote", "https://mcp.aiapplyd.com/sse"]
    }
  }
}
```

## Connect from ChatGPT

ChatGPT has two distinct integration paths. Pick based on what you have access to:

### Native MCP connector (ChatGPT connectors)

Newer ChatGPT connectors consume the MCP protocol directly. Add a custom connector pointing at:

```
https://mcp.aiapplyd.com/mcp
```

OAuth is handled in-app - sign in with Google to unlock connected and paid tools.

### Custom GPT via Actions (OpenAPI)

Not supported. ChatGPT Custom GPTs consume REST through Actions, and this server intentionally exposes **no anonymous REST surface** (every capability requires the OAuth-authenticated MCP protocol). Use the native MCP connector path above instead.

## Connect from Cursor

Go to **Settings → MCP → Add new MCP server** and add a remote server:

- URL (modern): `https://mcp.aiapplyd.com/mcp`

For Cursor builds without Streamable HTTP support, use the legacy bridge:

```json
{
  "mcpServers": {
    "ai-applyd": {
      "command": "npx",
      "args": ["mcp-remote", "https://mcp.aiapplyd.com/sse"]
    }
  }
}
```

## Any MCP Client

- Streamable HTTP (modern): `https://mcp.aiapplyd.com/mcp`
- SSE (legacy): `https://mcp.aiapplyd.com/sse`
- Server metadata / registry card: `https://mcp.aiapplyd.com/.well-known/mcp/server-card.json`

## Authentication

Every tool call requires a connected AI Applyd account. There are no anonymous tools and no free compute: an anonymous `tools/call` is answered with **HTTP 401 + `WWW-Authenticate`** (which is what makes hosted clients offer "Connect"), while discovery (`initialize`, `tools/list`) stays open so a connector can read the catalog and bootstrap OAuth.

You are prompted to sign in with Google the first time you invoke a tool. AI Applyd implements **OAuth 2.1** with Dynamic Client Registration:

- Discovery: `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource`
- Registration (DCR): `POST /register`
- Authorize: `GET /authorize` — **PKCE S256 is mandatory**; there is no `plain` and no non-PKCE path
- Token: `POST /oauth/token` — `authorization_code` and `refresh_token` grants
- Revoke: `POST /oauth/revoke` (RFC 7009)

Security properties, all covered by tests:

- **Short-lived access tokens** (1h) plus a **rotating refresh token** (90d). Each refresh issues a new refresh token and consumes the old one.
- **Refresh-token reuse detection.** Replaying a consumed refresh token means it leaked, so the entire token family is burned and the client must re-authorize.
- **Tokens are hashed at rest.** KV stores `SHA-256(token)`, never the token, so a KV dump yields no usable credential.
- **Revocation** kills the credential when a user disconnects the connector, instead of leaving it live until expiry.
- **Redirect allowlist** on both `/authorize` and DCR, so an open registration endpoint cannot smuggle in an attacker-owned redirect.
- **Rate limits** on `/register`, `/authorize`, `/oauth/token` and `/oauth/revoke` (all unauthenticated, all KV-writing).

Paid tools additionally require an active AI Applyd subscription with available token balance.

## Rate Limits

- **Tools** are governed by your AI Applyd plan: per-action allowances and your token balance, enforced API-side. See [pricing](https://aiapplyd.com/pricing).
- **The unauthenticated OAuth surface is rate limited per IP.** If you hit a limit, back off and retry.

## Status

This is a **hosted remote MCP server**. There is nothing to install and no local build step: point any
MCP-compatible client at `https://mcp.aiapplyd.com/mcp` and complete the OAuth flow.

This repository is the public home for the server's manifest (`server.json`), its documentation and
its connection instructions. The implementation runs as a Cloudflare Worker operated by AI Applyd.

## Links

- [AI Applyd](https://aiapplyd.com)
- [MCP listing page](https://aiapplyd.com/mcps)
- [Pricing](https://aiapplyd.com/pricing)
- [Documentation](https://aiapplyd.com/docs)
