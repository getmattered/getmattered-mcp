# Installing the GetMattered MCP server

GetMattered (Auto-Apply That Ends on an Interview) is a hosted remote MCP server. There is no API key. The first tool call opens a browser sign-in, with Google or an email link.

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

Then ask Cline: "Use GetMattered to show my job matches."
