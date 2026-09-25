# Installing the AI Applyd MCP server

AI Applyd (Auto-Apply That Ends on an Interview) is a hosted remote MCP server. There is nothing to build or run locally.

- URL: `https://mcp.aiapplyd.com/mcp`
- Transport: Streamable HTTP
- Auth: OAuth 2.1 with dynamic client registration. The first tool call opens a browser sign-in (Google). No API key.

## Cline

Add this to `cline_mcp_settings.json`:

```json
{
  "mcpServers": {
    "aiapplyd": {
      "type": "streamableHttp",
      "url": "https://mcp.aiapplyd.com/mcp"
    }
  }
}
```

If your Cline version only runs stdio servers, use the bridge in this repository instead:

```json
{
  "mcpServers": {
    "aiapplyd": {
      "command": "npx",
      "args": ["-y", "github:aiapplyd/aiapplyd-mcp"]
    }
  }
}
```

## Check that it works

Ask Cline: "Use AI Applyd to show my job matches." The first call asks you to sign in. After
that, the tools are available in every session.

## What the tools do

The main loop is five tools: `aiapplyd_get_matches` (your matched jobs), `aiapplyd_apply` (apply
to one, sent automatically or held for your approval), `aiapplyd_get_applications` (where each
application stands), `aiapplyd_review_application` (approve or reject what is waiting) and
`aiapplyd_get_account` (plan, balance and readiness). If no resume is on file, call
`aiapplyd_set_resume` first. The full list of tools is in the README.
