# Contributing

Thank you for helping.

This repository is published from GetMattered's own repository on every release. A pull request merged here would be replaced by the next release, so pull requests are read but not merged directly. When a change fits, a maintainer makes it in the source, and it ships in the next release.

## Bugs and ideas

Open an issue and pick a template. For a security problem, email security@getmattered.com instead of opening an issue (see [SECURITY.md](../SECURITY.md)).

Never post account data, tokens or a resume in an issue.

## Work on the bridge

You need Node 20 or newer.

```bash
npm ci
npm test                # builds, then runs the tests in test/
npm run verify:package  # checks the versions and the packaged files
```

`node dist/index.js` runs the bridge against the hosted server. `GETMATTERED_MCP_URL` points it at another endpoint.

## Skills and manifests

Skill and manifest text says what GetMattered does. `node scripts/wording-lint.mjs` checks it.

## Help

support@getmattered.com
