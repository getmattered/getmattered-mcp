# Installing the GetMattered MCP server

GetMattered (Auto-Apply That Ends on an Interview) is a hosted remote MCP server. There is nothing to build or run locally.

- URL: `https://mcp.getmattered.com/mcp`
- Transport: Streamable HTTP
- Auth: OAuth 2.1 with dynamic client registration. The first tool call opens a browser sign-in (Google). No API key.

## Cline

Add this to `cline_mcp_settings.json`:

```json
{
  "mcpServers": {
    "getmattered": {
      "type": "streamableHttp",
      "url": "https://mcp.getmattered.com/mcp"
    }
  }
}
```

If your Cline version only runs stdio servers, use the bridge in this repository instead:

```json
{
  "mcpServers": {
    "getmattered": {
      "command": "npx",
      "args": ["-y", "github:getmattered/getmattered-mcp"]
    }
  }
}
```

## Check that it works

Ask Cline: "Use GetMattered to show my job matches." The first call asks you to sign in. After
that, the tools are available in every session.

## What the tools do

The main loop is five tools: `getmattered_get_matches` (your matched jobs), `getmattered_apply` (apply
to one, sent automatically or held for your approval), `getmattered_get_applications` (where each
application stands), `getmattered_approve_applications` (send what is waiting for your review) and
`getmattered_get_account` (plan, balance and readiness). If no resume is on file, call
`getmattered_set_resume` first. Each tool does one operation, for example `getmattered_reject_applications` skips a held
application. Tool names from 1.10.1 and earlier still work. The full list of tools is in the README.
