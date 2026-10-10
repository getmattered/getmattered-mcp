# Changelog

## 1.8.4

The assistant bundle has ten job-search skills. Five new workflows cover account setup, cover letters, interview practice, resume translation and editable resume-builder drafts.

- OpenAI and Codex listing metadata now includes all supported job-search workflows, a valid subtitle, a support URL and example prompts. Review annotations match all 17 live tools.
- The cover-letter skill selects the correct saved builder document for a new letter and uses revision instructions only for an existing application.
- The resume-tailoring skill runs the analysis, score or rewrite the user requested. It does not start a chain of other credit-consuming tasks.
- A prepublish check refuses missing skills, icons or manifests, mismatched versions and invalid OpenAI metadata.
- npm now includes the plugin manifests, icons and all ten skill files alongside the CLI bridge.
- Gemini CLI discovers the same canonical skill files as the Claude, Cursor and Codex plugin packages through the root `skills/` link.
- Skills check account limits and request approval before credit-consuming actions or application sends. An application counts as landed only with employer evidence.
- Resume translation uses the default saved builder document, or the first saved build. It saves a separate translation.
- The resume-builder tool creates an editable summary draft of up to 2,000 characters. A full resume needs structured sections or an imported file in the builder before PDF export.

The package, registry/npm manifest, client manifests, root lockfile metadata and CLI version output use 1.8.4. Dependency versions are unchanged. Store publication remains subject to each platform's review.
