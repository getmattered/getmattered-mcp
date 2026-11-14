# Security

## Report a problem

Email **security@getmattered.com**. Please do not open a public issue for a security problem.

Say what you found and where: the hosted server at `mcp.getmattered.com`, the `getmattered-mcp` npm package, or a plugin, skill or manifest in this repository. Add the steps to reproduce it and what someone could do with it.

## What this repository holds

- The stdio bridge in `src/`. It forwards MCP messages to the hosted server without changing them. `getmattered-mcp login` signs in through the browser (OAuth with PKCE) and saves the sign-in to `~/.config/getmattered/credentials.json`, readable only by your user.
- The plugin, the skills and the listing manifests.

The hosted server runs on Cloudflare Workers. Its source is not public. Reports about it go to the same address.

## Supported versions

Fixes go into the newest release. The hosted server runs one version for everyone.

## More

- [security.txt](https://getmattered.com/.well-known/security.txt)
- [Security page](https://getmattered.com/legal/security)
- [Privacy policy](https://getmattered.com/legal/privacy)
