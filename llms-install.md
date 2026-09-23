# Installing the AI Applyd MCP server

AI Applyd is a hosted remote MCP server. There is nothing to build or run locally.

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

Ask Cline: "Use AI Applyd to search for remote product designer jobs." The first call asks you to
sign in. After that, the tools are available in every session.
