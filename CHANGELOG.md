# Changelog

## 1.20.0

41 tools with the same names. Changed: Fuller text for the six B-graded tools, less repeated argument text. Fixed: restore_matches says a closed posting's id fails. Declare no token in server.json or the Docker image.

## 1.19.2

41 tools with the same names. Improved: The skills name the five free applications on every surface and batch apply of 10.

## 1.19.1

41 tools with the same names. Fixed: Point the Docker icon at main so a release pushes nothing to the waiting PR.

## 1.19.0

41 tools. A new account's first answer asks for the resume. The first matches answer offers the best 3 jobs under one yes. getmattered_apply answers within seconds on every client, and a job still starting shows in getmattered_get_applications. Approving an application that is already counted never uses another free application.

## 1.18.0

41 tools. New: getmattered_search_jobs searches every job GetMattered can apply to, by words, place, seniority and visa, and keeps the saved search as it is. getmattered_apply takes up to 10 jobs under one yes. A Y Combinator job behind a Work at a Startup account stays on the board, and the answer says why. Adding a role or a city keeps the saved ones.

## 1.17.1

40 tools with the same names. get_account's description is back to its approved wording.

## 1.17.0

40 tools with the same names. Tool descriptions now lead with the words people search with: job search, job application tracker, tailoring a resume to a job description, recruiter emails and job alerts. get_matches, get_applications and get_account explain what they return.

## 1.16.0

40 tools with the same names. A job board link, such as Y Combinator, now goes to the employer's own application form when one exists. When GetMattered cannot apply to a job, it keeps the job on the user's GetMattered board and tells the user once it can send it. The title and place filters of get_matches now say that they narrow the user's matches and do not search for new jobs.

## 1.15.4

40 tools with the same names. When GetMattered cannot apply to a job, the answer says why and offers the closest job from the user's GetMattered matches. Two skills say the same.

## 1.15.3

40 tools with the same names. Each GitHub release also carries a Claude Desktop bundle (.mcpb). With it, the first tool call without a sign-in opens your browser to sign in. A tool call waits at most 45 seconds for that sign-in, and a cancelled call is never sent. Every release checks the plugin and its wording before it publishes, and a daily check lists which directories show the newest version.

## 1.15.2

40 tools with the same names. Poke and any client that opens a session before sign-in now continue after sign-in instead of seeing "Session not found"; another user's sign-in on that session is still refused. Install pages show the server address with a copy button next to the Poke link. The bridge README links to the current ChatGPT app, the website serves the same skill files the connector ships, and setup text and the server card carry current facts.

## 1.15.1

40 tools with the same names. Server instructions, tool descriptions and skills describe what each tool does. The inbox and replies stay. A refused job link names the reason, a preference save keeps the stated fields when the AI allowance is used up, a batch of links waits and retries inside the call, and a resume sent as a link or as text is read.

## 1.15.0

The hosted server lists the same 40 tools as 1.14.0, with the same names. Its answers changed.
The stdio bridge has no code change beyond its version.

- Every answer that ends without an application names one next step inside GetMattered.
- A short or filtered match list says how to get more: save more roles or places, or pass a
  posting link to `getmattered_apply`.
- Missing profile fields are never asked for per application. Address fields come from the
  saved address and location. With gap filling on, an empty postal code is filled too. With it
  off, only a form that requires a postal code waits until the profile has one. Answers no
  longer say a value was guessed.
- `getmattered_apply` follows the user's apply setting when `mode` is left out, and reports
  `review` or `auto`.
- `getmattered_get_applications` gives one plain reason per application and counts held rows
  on their own. A row the user declined reads "You declined it. Nothing was sent." Rejecting or
  cancelling sends nothing, and the preparation already done stays charged.
- Workday, BambooHR and unlisted Ashby links are read by their structure.
- A job board link (LinkedIn, Indeed and others) resolves to the employer's own posting. When it
  cannot, the answer gives one step: find the job on the employer's own careers page or hiring
  system with your own search, then apply with that link. Otherwise tell the user GetMattered
  cannot apply to it.
- A careers page on the employer's own domain finds its Ashby, Greenhouse or Lever posting.
- No answer names a placeholder such as "Untitled role" or "Unknown company".
- `getmattered_get_account` shows the free MCP applications truthfully, including when an
  account cannot use them.
- `getmattered_update_job_preferences` reads the saved places back.

Skills: apply-to-a-job, find-matching-jobs, review-and-send, setup-job-search,
track-applications and using-getmattered follow these rules.

## 1.14.1

The hosted server is unchanged. The bridge now reads only `GETMATTERED_TOKEN` and
`~/.config/getmattered/credentials.json`. A setup saved under the earlier name must sign in
again: run `getmattered-mcp login`, or set `GETMATTERED_TOKEN`.

## 1.14.0

The hosted server lists the same 40 tools as 1.13.0, with the same names and schemas. Server
instructions and tool descriptions are shorter.

The stdio bridge drops the command and the endpoint variable from before the rename. Run
`getmattered-mcp` and set `GETMATTERED_MCP_URL`.

## 1.13.0

The hosted server lists the same 40 tools as 1.12.0, with the same names, descriptions and
schemas. The stdio bridge has no code change beyond its version.

- `getmattered_apply` with `job_url` now takes a LinkedIn or Indeed job link too.
- A job link resolves to the employer's own posting first. It is checked against the hiring
  systems GetMattered applies on before anything is spent. When it cannot apply, the answer is
  `not_applied`, nothing is saved, sent or spent, and the text names the cause: LinkedIn Easy
  Apply only, no employer posting found, or a hiring system GetMattered does not submit on.
- `getmattered_get_applications` says in words where each application stands: preparing,
  waiting for approval, sending, submitted and not yet confirmed, landed (only with the
  employer's proof), or never started, with its reason.

## 1.12.0

The hosted server now lists 40 tools. `getmattered_get_profile` (added in 1.11.0) reads the
user's profile. The stdio bridge has no code change beyond its version.

- An empty match list says what to do next: ask for the resume or roles, tell the user the
  search is running (first matches usually in about 10 minutes, with an email), or ask whether
  to widen roles or places. It no longer invites calling again at once.
- A filtered `get_matches` checks up to 200 matches and says how many it checked.
- A rate limit or an expired connection answers in its own words, says nothing was sent and how
  long to wait.
- Applying by link to a posting that is gone answers `posting_not_found` instead of an HTTP 404.
- Tool analytics record argument names, never values.
- Resume scoring, rewriting, cover letters, job analysis and document refinement follow stricter
  no-invention rules.

## 1.10.4

The stdio bridge now exits when its host lets go. It shuts down when stdin ends or closes, and on
SIGHUP, SIGTERM and SIGINT. Before exiting it waits up to 1.5 seconds for answers to requests
still in flight and writes them out. Before this, a host that closed stdin left the bridge running
with an open stream to the server. A test spawns the bridge, closes stdin and checks it exits
within 2 seconds.

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

Replaced:

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

Tool behavior is unchanged.

- The npm package is `getmattered-mcp`.
- The package also installs a second command name. Both run the same file.
- The default endpoint is `https://mcp.getmattered.com/mcp`.
- `GETMATTERED_TOKEN` and `GETMATTERED_MCP_URL` set the token and the endpoint. Fallback variable
  names are still read when these are unset.
- Tool ids are `getmattered_<name>`. Other tool id prefixes are accepted as aliases.
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

- `using-getmattered` maps each request to its tools and order, lists the actions that need the user's yes, and ends each result with one next step offered to the user, with no prices or billing links.
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
