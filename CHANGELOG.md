# Changelog

## 1.10.3

The README and the plugin manifests link the current product demo film,
[2uxVDG0dxQ4](https://www.youtube.com/watch?v=2uxVDG0dxQ4). No tool changes.

## 1.10.2

Each tool now does one operation. The hosted server lists 39 tools, up from 23. Every earlier
tool name still works: the server runs it as the tool that does that operation now, and never
lists it in `tools/list`.

New tools, one per operation:

- Applications held for review: `getmattered_approve_applications`, `getmattered_reject_applications`,
  `getmattered_cancel_applications`, `getmattered_refine_application_documents`,
  `getmattered_reprepare_applications` and `getmattered_set_application_stage`.
- Matches: `getmattered_save_matches`, `getmattered_skip_matches`, `getmattered_unsave_matches` and
  `getmattered_restore_matches`.
- Follow-ups: `getmattered_list_due_follow_ups`, `getmattered_list_sent_follow_ups`,
  `getmattered_draft_follow_up`, `getmattered_send_follow_up` and `getmattered_record_follow_up`.
- Saved searches: `getmattered_list_saved_searches`, `getmattered_create_saved_search`,
  `getmattered_update_saved_search` and `getmattered_delete_saved_search`.
- Application profile: `getmattered_get_application_profile` reads it.
  `getmattered_update_application_profile` now saves only the fields passed. A call with no
  arguments still returns the profile, as before.

Renamed:

- The resume PDF tool built no PDF, so it is three tools now: `getmattered_get_resume_pdf_link`
  (read-only link to the PDF on file), `getmattered_share_resume_pdf` (public link, only on
  request) and `getmattered_create_resume_draft` (summary-only builder draft from `summary_text`).
- `getmattered_update_auto_apply` is `getmattered_update_automatic_apply_settings`.

Deprecated, still accepted as aliases and no longer listed:

- `getmattered_review_application` (routed by `decision`)
- `getmattered_triage_matches` (routed by `action`)
- `getmattered_manage_follow_ups` (routed by `action`)
- `getmattered_manage_saved_searches` (routed by `action`)
- `getmattered_build_pdf` (routed by its arguments)
- `getmattered_update_auto_apply`
- `getmattered_auto_apply` (runs `getmattered_apply`)
- `getmattered_search_jobs` (runs `getmattered_get_matches` with `query`)

The README lists every route. An unknown `action` or `decision` value answers "tool not found".

Also in this release:

- Every listed tool has a title, all four annotation hints, an output schema and a description
  that says what changes, whether it can be undone, and when to use another tool instead.
- Resource URIs use the `getmattered://` scheme. URIs from earlier versions still resolve.
- The fourteen skills, the README, `GEMINI.md`, `llms-install.md`, `smithery.yaml` and the plugin
  test cases use the new tool names.
- The stdio bridge passes a tool name the server no longer lists through unchanged, so scripts
  that call an earlier name keep working.

## 1.10.1

- Documentation and listing text only. No code path changed except the `--help` footer.
- `server.json` carries the registry icon.

## 1.10.0

First release under the GetMattered name. Tool behavior is unchanged.

- The npm package is `getmattered-mcp`. The earlier package is deprecated on npm and points here.
- The package also installs the earlier command name. Both run the same file.
- The default endpoint is `https://mcp.getmattered.com/mcp`.
- `GETMATTERED_TOKEN` and `GETMATTERED_MCP_URL` set the token and the endpoint. The variable names
  used before the rename are still read when these are unset.
- Tool ids are `getmattered_<name>`. Earlier tool ids are accepted as aliases.
- The stored sign-in moves to `~/.config/getmattered/credentials.json`. A sign-in stored by an
  earlier version is still read, and `logout` removes both.
- The plugin is `getmattered` in `plugins/getmattered`, and the tool map skill is `using-getmattered`.
- The MCP Registry name is `com.getmattered/getmattered`. Homepage, repository, support and
  maintainer addresses use getmattered.com and github.com/getmattered/getmattered-mcp.

## 1.9.1

Corrects application coverage in package and plugin descriptions to 30+ hiring systems. Updates the gallery image to match current application coverage. Includes fourteen portable job-search skills.

## 1.9.0

The assistant bundle has fourteen job-search skills. Four new skills cover the tool map, recruiter replies, follow-ups and saved searches.

New tools on the hosted server:

- `getmattered_get_inbox` reads the emails employers sent to the user's GetMattered address, with drafted replies for a conversation. Sign-up codes and other account mail are marked and never count as an employer reply.
- `getmattered_reply_to_email` sends the user's reply to an employer. Skills show the exact text first and send only after the user says yes to it.
- `getmattered_update_auto_apply` turns Auto Apply on or off and sets review or auto mode, the daily limit and the lowest match. Turning it on or choosing auto mode needs the user's yes.
- `getmattered_update_application_profile` reads and saves the answers employer forms need, and lists the details recent applications had to guess.
- `getmattered_manage_follow_ups` lists due follow-ups, drafts one, sends it from a connected Gmail or Outlook after the user's yes, or records one the user sent.
- `getmattered_manage_saved_searches` saves the current job preferences as a named search and turns email alerts for new matches on or off.

Changed behavior:

- `getmattered_score_resume`, `getmattered_optimize_resume` and `getmattered_translate_resume` take `resume_text` for a resume pasted in the chat, or `resume_file` for a file attached in ChatGPT. `getmattered_generate_cover_letter` takes `resume_text`. Without them, the tools use the resume on file.
- Translation and cover letters no longer need a resume-builder document.
- `getmattered_set_resume` also takes `resume_file`.
- `getmattered_build_pdf` with no `resume_text` returns the PDF link of the resume on file and creates nothing.

Skills:

- `using-ai-applyd` maps each request to its tools and order, lists the actions that need the user's yes, and ends each result with one next step offered to the user, with no prices or billing links.
- `handle-recruiter-replies`, `follow-up-on-applications` and `manage-saved-searches` are new.
- The apply, setup, tailoring, cover letter, translation, resume document, matching, tracking and interview skills describe the new resume sources and point to the new workflows. `apply-to-a-job` covers Auto Apply settings.

The package, registry/npm manifest, client manifests, root lockfile metadata and CLI version output use 1.9.0. The prepublish check expects fourteen skills. Dependency versions are unchanged.

## 1.8.5

Publishes the ten-skill bundle from 1.8.4 to npm and the MCP Registry. npm still held an older 1.8.4 build staged on October 8, so this release uses the next version number. The code and skills match 1.8.4.

## 1.8.4

The assistant bundle has ten job-search skills. Five new workflows cover account setup, cover letters, interview practice, resume translation and editable resume-builder drafts.

- OpenAI and Codex listing metadata now includes all supported job-search workflows, a valid subtitle, a support URL and example prompts. Review annotations match all 17 live tools.
- The cover-letter skill selects the correct saved builder document for a new letter and uses revision instructions only for an existing application.
- The resume-tailoring skill runs the analysis, score or rewrite the user requested. It does not start a chain of other credit-consuming tasks.
- A prepublish check refuses missing skills, icons or manifests, mismatched versions and invalid OpenAI metadata.
- npm now includes the plugin manifests, icons and all ten skill files alongside the CLI bridge.
- Gemini CLI discovers the same canonical skill files as the Claude, Cursor and Codex plugin packages through the root `skills/` link.
- OpenAI's setup action opens the packaged job-search setup skill after installation.
- Skills check account limits and request approval before credit-consuming actions or application sends. An application counts as landed only with employer evidence.
- Resume translation uses the default saved builder document, or the first saved build. It saves a separate translation.
- The resume-builder tool creates an editable summary draft of up to 2,000 characters. A full resume needs structured sections or an imported file in the builder before PDF export.

The package, registry/npm manifest, client manifests, root lockfile metadata and CLI version output use 1.8.4. Dependency versions are unchanged. Store publication remains subject to each platform's review.
