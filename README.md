<div align="center">

<img src="assets/logo.png" alt="GetMattered" width="96" height="96" />

# GetMattered MCP Server

Version 1.10.4. It includes fourteen portable job-search skills. See the [changelog](CHANGELOG.md).

**Auto-Apply That Ends on an Interview**

**Stop applying. Start interviewing.**

Score your resume the way the screening software scores it, rewrite it for the exact role,
write the cover letter, prepare for the interview, and send the application in on the
employer's own hiring system. All from inside the assistant you already work in.

<br />

<img src="assets/01-stop-applying-start-interviewing.png" alt="GetMattered - stop applying, start interviewing" width="820" />

**And it keeps the employer's own confirmation.** Most tools count applications sent, which is
a number the tool awards itself off its own button click. This one reports what the employer's
system actually returned, so a real rejection is distinguishable from a form that quietly
dropped your application.

[![Glama quality score](https://glama.ai/mcp/servers/getmattered/getmattered-mcp/badges/score.svg)](https://glama.ai/mcp/servers/getmattered/getmattered-mcp)
[![Smithery](https://img.shields.io/badge/Smithery-GetMattered-7c3aed)](https://smithery.ai/servers/aiapplyd/aiapplyd)
[![MCP Registry](https://img.shields.io/badge/MCP%20Registry-com.getmattered%2Fgetmattered-blue)](https://registry.modelcontextprotocol.io/v0/servers?search=getmattered)
[![GetMattered on LobeHub](https://lobehub.com/badge/mcp/aiapplyd-aiapplyd-mcp)](https://lobehub.com/mcp/aiapplyd-aiapplyd-mcp)
[![Listed on mcpservers.org](https://mcpservers.org/badge.svg)](https://mcpservers.org/servers/aiapplyd/aiapplyd-mcp)
[![Listed on cursor.directory](https://img.shields.io/badge/Listed%20on-cursor.directory-black)](https://cursor.directory/plugins/ai-applyd-1)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**[Listing page](https://getmattered.com/mcps)** · **[Website](https://getmattered.com)** · **[Privacy](https://getmattered.com/legal/privacy)** · **[Terms](https://getmattered.com/legal/terms)**

</div>

---

Most applicants are screened out by software before a person reads a word, and a good number
are never screened at all, because the form silently dropped a required field or the upload
never attached. From the candidate's side those look identical to rejection, which is why so
many people rewrite a CV nobody ever read.

This server puts both halves of that process in your hands: the screening, and the proof that
the application arrived.

<div align="center">

<img src="assets/02-only-roles-that-actually-fit.png" alt="Only roles that actually fit, scored before you see them" width="49%" />
<img src="assets/03-the-company-confirmed-it.png" alt="The employer's own system confirming an application arrived" width="49%" />

<img src="assets/04-sent-means-they-got-it.png" alt="Sent means they got it: every application carries the employer's confirmation" width="49%" />
<img src="assets/05-we-apply-where-the-jobs-live.webp" alt="It applies on 30+ hiring systems, where the jobs actually live" width="49%" />

<img src="assets/06-you-always-know-where-you-stand.png" alt="You always know where every application stands" width="49%" />
<img src="assets/07-they-wrote-back-an-interview.png" alt="They wrote back: an interview, not a no" width="49%" />

<img src="assets/08-wake-up-to-interviews.png" alt="Wake up to interviews" width="820" />

<sub>From the first match to the interview invite. Every application carries the employer's own confirmation.</sub>

</div>

Every application goes in on the company's real careers page, under your name, with your own
materials. It lands on 30+ hiring systems, including **Greenhouse, Lever, Ashby, Workday, Personio, Teamtailor, SmartRecruiters, Recruitee, Breezy, Workable, Rippling, BambooHR, JazzHR, softgarden, Jobvite, Gem, Zoho Recruit, Dayforce, Hireology, Dover, Oracle Recruiting Cloud, Paylocity, Oracle Taleo, UKG Pro Recruiting, ADP, Avature, CareerPlug, Pinpoint, Manatal, and Eightfold**.

Nothing to install. Connect once and run it from Claude, ChatGPT, Codex, Cursor, Gemini CLI, VS Code or any MCP client, and from your phone over iMessage through Poke.

**The whole job search in five calls:** see your matches (`getmattered_get_matches`), apply to one
(`getmattered_apply`, sent automatically or held for your yes), approve what is waiting
(`getmattered_approve_applications`), track every application to the employer's own receipt
(`getmattered_get_applications`), and check your plan and what is left (`getmattered_get_account`).
The full list is under [Tools](#tools).

## Watch the demo

[![GetMattered demo: AI auto-apply to jobs that ends on an interview](https://img.youtube.com/vi/2uxVDG0dxQ4/maxresdefault.jpg)](https://www.youtube.com/watch?v=2uxVDG0dxQ4)

90 seconds: resume upload, job matching, a real application sent on the employer's own form, the
employer's confirmation email, interview prep, and applying from ChatGPT, Claude and Cursor.

## Quick start

One click, if your app supports it:

[![Add to Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/install-mcp?name=getmattered&config=eyJ1cmwiOiJodHRwczovL21jcC5nZXRtYXR0ZXJlZC5jb20vbWNwIn0=)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=getmattered&config=%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A//mcp.getmattered.com/mcp%22%7D)
[![Add to Poke (iMessage)](https://img.shields.io/badge/iMessage-Add_to_Poke-34C759?logo=imessage&logoColor=white)](https://poke.com/integrations/new?name=GetMattered&url=https%3A%2F%2Fmcp.getmattered.com%2Fmcp)


GetMattered is a **hosted remote MCP server**. Point your client at one URL:

```
https://mcp.getmattered.com/mcp
```

The first tool call opens an OAuth sign-in. Sign in with Google, and you are connected.
A free account needs no card and arrives with a one-time 10,000-token starter grant.

### Claude (web, Desktop, Code)

**Settings → Connectors → Add custom connector**

| Field | Value |
|---|---|
| Name | `GetMattered` |
| Remote MCP server URL | `https://mcp.getmattered.com/mcp` |

In Claude Code, one line does it:

```bash
claude mcp add --transport http getmattered https://mcp.getmattered.com/mcp
```

### Cursor

`~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "getmattered": {
      "url": "https://mcp.getmattered.com/mcp"
    }
  }
}
```

### ChatGPT

GetMattered is an app in ChatGPT. [Open GetMattered in ChatGPT](https://chatgpt.com/plugins/plugin_asdk_app_6ab3d2a748e48191a449904e048cd233),
add it, and sign in with your GetMattered account when ChatGPT asks. Then ask for your job matches
in a new chat. There is no Action schema to import and nothing to host.

### VS Code

```bash
code --add-mcp '{"name":"getmattered","type":"http","url":"https://mcp.getmattered.com/mcp"}'
```

### Plugin for Codex, ChatGPT, Claude Code and Cursor

This repository is a plugin marketplace. The `getmattered` plugin bundles the MCP server with fourteen
skills, in the portable `plugin.json` format that Codex, ChatGPT, Claude Code and Cursor read:

| Skill | Use it when |
|---|---|
| [`using-getmattered`](plugins/getmattered/skills/using-getmattered/SKILL.md) | You want the assistant to pick the right tool and order for your request |
| [`setup-job-search`](plugins/getmattered/skills/setup-job-search/SKILL.md) | You want to set your base resume, finish your profile or check readiness |
| [`find-matching-jobs`](plugins/getmattered/skills/find-matching-jobs/SKILL.md) | You want your job matches, want to save or skip one, or want to change what it looks for |
| [`apply-to-a-job`](plugins/getmattered/skills/apply-to-a-job/SKILL.md) | You want to apply, or you paste a job link and say "apply" |
| [`review-and-send`](plugins/getmattered/skills/review-and-send/SKILL.md) | You want to see what is waiting for you, change it, and send it |
| [`tailor-for-a-job`](plugins/getmattered/skills/tailor-for-a-job/SKILL.md) | You want a posting analysis, an ATS score or a resume rewrite for one role |
| [`track-applications`](plugins/getmattered/skills/track-applications/SKILL.md) | You ask "did it go through", or how many applications you have left |
| [`write-cover-letter`](plugins/getmattered/skills/write-cover-letter/SKILL.md) | You want a letter for one job or changes to an existing letter |
| [`prepare-for-interview`](plugins/getmattered/skills/prepare-for-interview/SKILL.md) | You want role-specific questions and to practise answers from your own experience |
| [`handle-recruiter-replies`](plugins/getmattered/skills/handle-recruiter-replies/SKILL.md) | An employer wrote back and you want to read it and send a reply you approved |
| [`follow-up-on-applications`](plugins/getmattered/skills/follow-up-on-applications/SKILL.md) | An application has gone quiet and you want to follow up |
| [`manage-saved-searches`](plugins/getmattered/skills/manage-saved-searches/SKILL.md) | You want to save a search and get emailed about its new jobs |
| [`translate-resume`](plugins/getmattered/skills/translate-resume/SKILL.md) | You want your resume in another language |
| [`build-resume-document`](plugins/getmattered/skills/build-resume-document/SKILL.md) | You want the PDF link of your resume on file, or a private editable summary draft to finish in the builder |

The hosted skill index is at
[`getmattered.com/.well-known/agent-skills/index.json`](https://getmattered.com/.well-known/agent-skills/index.json).
The plugin files are in `plugins/getmattered/skills/`. The root `skills/` link points to that same
directory so Gemini CLI discovers the workflows without a second set of skill files.

Skills check account limits before metered work and get approval before credit-consuming actions
or sending an application. Installing a plugin does not buy a GetMattered plan. Public directory
approval is separate from installing this repository directly.

Codex:

```bash
codex plugin marketplace add getmattered/getmattered-mcp
codex plugin add getmattered@getmattered
```

Claude Code:

```bash
claude plugin marketplace add getmattered/getmattered-mcp
claude plugin install getmattered@getmattered
```

### Codex (CLI, IDE extension and the ChatGPT desktop app)

```bash
codex mcp add getmattered --url https://mcp.getmattered.com/mcp
codex mcp login getmattered
```

The Codex CLI, the IDE extension and the ChatGPT desktop app share this configuration.

### Gemini CLI

This repository is also a Gemini CLI extension (`gemini-extension.json`, `GEMINI.md` and the same
fourteen skills):

```bash
gemini extensions install https://github.com/getmattered/getmattered-mcp
```

Or add the server by hand in `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "getmattered": { "httpUrl": "https://mcp.getmattered.com/mcp" }
  }
}
```

### Zed

**Settings → AI → MCP Servers → Add Remote Server**, then paste `https://mcp.getmattered.com/mcp`.

### Windsurf

`~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "getmattered": { "command": "npx", "args": ["-y", "mcp-remote", "https://mcp.getmattered.com/mcp"] }
  }
}
```

### Perplexity, Mistral Le Chat and Raycast

Each has a custom connector screen that takes a remote MCP URL. Paste
`https://mcp.getmattered.com/mcp` and choose OAuth.

### From your phone: iMessage, Telegram and WhatsApp

- **iMessage / SMS:** [add GetMattered to Poke in one tap](https://poke.com/integrations/new?name=GetMattered&url=https%3A%2F%2Fmcp.getmattered.com%2Fmcp)
  (or `npx poke@latest mcp add https://mcp.getmattered.com/mcp -n "GetMattered"`), sign in, then text Poke:
  "find me remote product designer jobs and apply to the best two".
- **Telegram, WhatsApp or iMessage on your own server:** [OpenClaw](https://github.com/SamurAIGPT/awesome-openclaw)
  is a self-hosted gateway. Add the URL as an MCP server and enable the channel you use.

### Any client that only speaks stdio

This repository ships a thin bridge. It relays the protocol to the hosted server and adds
nothing of its own.

```bash
npx -y github:getmattered/getmattered-mcp
```

Or with Docker:

```bash
docker build -t getmattered-mcp .
docker run --rm -i getmattered-mcp
```

```json
{
  "mcpServers": {
    "getmattered": {
      "command": "docker",
      "args": ["run", "--rm", "-i", "getmattered-mcp"]
    }
  }
}
```

| Environment variable | Default | Meaning |
|---|---|---|
| `GETMATTERED_MCP_URL` | `https://mcp.getmattered.com/mcp` | Endpoint to relay to. Point it at `https://mcp-preview.getmattered.com/mcp` to test against preview. The variable name used before the rename is still read when this one is unset. |
| `GETMATTERED_TOKEN` | unset | Optional bearer token. Without it the server still answers introspection; tool **calls** return 401 until an account is connected. The variable name used before the rename is still read when this one is unset. |

## Command line and bots

The same package is a small CLI, so a script, a cron job or a chat bot (Telegram, WhatsApp,
iMessage) can run the whole job search without an MCP client.

```bash
npx getmattered-mcp login                                    # sign in once in the browser
npx getmattered-mcp tools                                    # list the tools
npx getmattered-mcp call getmattered_get_matches '{"limit": 5}' # matched jobs as JSON
npx getmattered-mcp call getmattered_apply '{"job_match_id": 123, "mode": "review"}'
npx getmattered-mcp call getmattered_get_applications '{"status": "waiting_for_review"}'
npx getmattered-mcp call getmattered_approve_applications '{"application_ids": [456]}'
```

`login` runs the same OAuth sign-in a desktop client runs and stores the token in
`~/.config/getmattered/credentials.json` (mode 600). It refreshes on its own, so an unattended bot
keeps working. `call` prints the tool's structured result as JSON. Exit code 0 means success,
1 means the tool reported an error, 2 means you are not signed in.

Run with no arguments and it is a stdio MCP server that relays to `https://mcp.getmattered.com/mcp`,
signed in with the stored login. `GETMATTERED_TOKEN` overrides the stored login and
`GETMATTERED_MCP_URL` overrides the endpoint.

### Renamed

This package was renamed to `getmattered-mcp`. Existing setups keep working:

- The package also installs the earlier command name. Both run the same code.
- Tool ids are `getmattered_<name>`. Earlier tool ids are accepted as aliases.
- Tool names from 1.10.1 and earlier, before each tool did one operation, still work. See
  [Earlier tool names, still answered](#earlier-tool-names-still-answered).
- The environment variable names used before the rename are still read when the
  `GETMATTERED_*` ones are unset.
- A sign-in stored by an earlier version is still read. The next `login` or token refresh
  writes `~/.config/getmattered/credentials.json`.

## Endpoints

| Environment | Streamable HTTP (modern) | SSE (legacy bridges) |
|---|---|---|
| Production | `https://mcp.getmattered.com/mcp` | `https://mcp.getmattered.com/sse` |
| Preview | `https://mcp-preview.getmattered.com/mcp` | `https://mcp-preview.getmattered.com/sse` |

Use `/mcp`. `/sse` remains only for clients that cannot speak Streamable HTTP.

## Tools

The table below is generated from the live `tools/list` of `https://mcp.getmattered.com/mcp`.
Every tool runs on the caller's own GetMattered account. Reading matches, applications
and account limits does not run AI generation. AI work and applications use the
account's allowance. Tool calls require sign-in; introspection is public.

### One tool per operation

Since 1.10.2 every tool does exactly one thing, with its own description, input schema and
annotations. No tool takes an `action` or `decision` argument that picks between operations.
The server lists 40 tools.

### First run

On a new account, `getmattered_get_matches` comes back empty with `nextStep`, the one thing to ask
for: the resume (`getmattered_set_resume`), then the roles and places (`getmattered_update_job_preferences`).
The first matches usually arrive within about 10 minutes, and GetMattered emails you when they do.

### The main loop

Five tools run the whole job search from a chat, or from a bot where a match drops and you
reply "yes":

```
getmattered_get_matches -> getmattered_apply -> getmattered_get_applications -> getmattered_approve_applications
                  getmattered_get_account (plan, what is left, readiness)
```

| Tool | Title | Hints | What it does |
|---|---|---|---|
| `getmattered_get_matches` | Get Job Matches | read-only, idempotent, open-world | Your matched jobs, best first, each with the `job_match_id` that apply takes. Also reads full postings, or any posting from a link without saving it |
| `getmattered_apply` | Apply to Job | **destructive**, open-world | Apply to one job by `job_match_id` or `job_url` on the employer's own hiring system. `mode: "auto"` sends it, `mode: "review"` holds it for your yes |
| `getmattered_get_applications` | Get Applications | read-only, idempotent | Every application and where it stands, the review queue, and the employer's own confirmation when it exists |
| `getmattered_approve_applications` | Approve Applications | **destructive**, open-world | Sends applications held for your review to their employers, up to 25 at once. Cannot be undone |
| `getmattered_get_account` | Get Account | read-only, idempotent | Your plan, token balance, applications left, job preferences, and whether your profile is ready to apply. Never passwords, tokens or card details |
| `getmattered_get_profile` | Get Profile | read-only, idempotent | Which GetMattered account the connection is signed in as: account id, name and email. ChatGPT labels each connected account with it |

### Applications

| Tool | Title | Hints | What it does |
|---|---|---|---|
| `getmattered_reject_applications` | Reject Applications | **destructive**, idempotent | Skips applications held for your review. Nothing is sent |
| `getmattered_cancel_applications` | Cancel Applications | **destructive**, idempotent | Stops applications still queued or being prepared, before they are sent |
| `getmattered_refine_application_documents` | Rewrite Application Documents | **destructive** | Rewrites an application's resume or cover letter from your instructions, before it is sent. Uses AI credits |
| `getmattered_reprepare_applications` | Prepare Applications Again | **destructive** | Builds an application's tailored documents again. Uses AI credits |
| `getmattered_set_application_stage` | Record Application Stage | writes, idempotent | Records how an application is going: callback, interview, offer or rejection |

### Setup and triage

| Tool | Title | Hints | What it does |
|---|---|---|---|
| `getmattered_set_resume` | Set Resume | **destructive**, open-world | Put your resume on your account as the base every application is tailored from: pasted text, a file link, or a saved resume |
| `getmattered_save_matches` | Save Job Matches | writes, idempotent | Saves matches to your saved list. Undone by `getmattered_unsave_matches` |
| `getmattered_skip_matches` | Skip Job Matches | writes, idempotent | Skips matches with a reason, so a job you declined stops coming back. Undone by `getmattered_restore_matches` |
| `getmattered_unsave_matches` | Remove Saved Matches | writes, idempotent | Takes matches off your saved list |
| `getmattered_restore_matches` | Restore Skipped Matches | writes, idempotent | Brings back skipped matches while the posting is open |
| `getmattered_update_job_preferences` | Update Job Preferences | **destructive**, idempotent | Point GetMattered at the roles, locations, salary and seniority you want, and re-run discovery |
| `getmattered_update_automatic_apply_settings` | Update Auto Apply Settings | **destructive**, idempotent, open-world | Turns Auto Apply on or off and sets whether applications go out on their own or wait for your review |
| `getmattered_get_application_profile` | Get Application Profile | read-only, idempotent | The answers employer forms are filled from, and what is still missing |
| `getmattered_update_application_profile` | Update Application Profile | **destructive**, idempotent | Saves only the fields you give. EEO answers are optional and accept prefer not to say |
| `getmattered_list_saved_searches` | List Saved Searches | read-only, idempotent | Your saved searches and their email alerts |
| `getmattered_create_saved_search` | Save Current Search | writes | Saves your current job preferences as a named search, with optional email alerts |
| `getmattered_update_saved_search` | Update Saved Search | writes, idempotent | Renames a saved search or turns its email alerts on or off |
| `getmattered_delete_saved_search` | Delete Saved Search | **destructive**, idempotent | Deletes a saved search, only when you ask |

### Inbox and follow-ups

| Tool | Title | Hints | What it does |
|---|---|---|---|
| `getmattered_get_inbox` | Get Recruiter Inbox | read-only, idempotent | The emails employers send about your applications, with the full conversation and suggested replies |
| `getmattered_reply_to_email` | Reply to an Employer Email | **destructive**, open-world | Sends your reply to an employer from your GetMattered address, only after you approve the exact text |
| `getmattered_list_due_follow_ups` | List Due Follow-ups | read-only, idempotent | Applications that went quiet and are due a follow-up, most urgent first |
| `getmattered_list_sent_follow_ups` | List Sent Follow-ups | read-only, idempotent | The follow-ups you already sent or recorded |
| `getmattered_draft_follow_up` | Draft a Follow-up | writes | Drafts a follow-up for one application. Nothing is sent. Uses AI credits |
| `getmattered_send_follow_up` | Send a Follow-up Email | **destructive**, open-world | Sends a follow-up from your connected Gmail or Outlook, only after you approve the exact text |
| `getmattered_record_follow_up` | Record a Follow-up | writes | Records a follow-up you sent yourself, so the next one is timed right |

### Resume, cover letter and interview

| Tool | Title | Hints | What it does |
|---|---|---|---|
| `getmattered_score_resume` | Score Resume | writes | An ATS score with section scores, the keywords you match and the ones you are missing, and what to change |
| `getmattered_analyze_job_description` | Analyze Job Description | writes | What a posting screens on, in its own language, so the resume can mirror it |
| `getmattered_optimize_resume` | Optimize Resume | writes | A resume rewritten to pass ATS screening and still reach a human reader |
| `getmattered_generate_interview_questions` | Generate Interview Questions | writes, open-world | The questions this role is asked, with answer guidance, STAR scenarios and negotiation prep |
| `getmattered_translate_resume` | Translate Resume | writes | Translates your resume into another language as a separate document. Works from the resume on file, or a resume pasted or attached in chat |
| `getmattered_generate_cover_letter` | Generate Cover Letter | **destructive** | A cover letter in your own voice, written from the resume on your account or one pasted in chat |
| `getmattered_get_resume_pdf_link` | Get Resume PDF Link | read-only, idempotent | The private link to the PDF of your resume on file. Creates nothing |
| `getmattered_share_resume_pdf` | Share Resume PDF Publicly | writes, idempotent, open-world | Makes a public link to your resume PDF, only when you ask. Turn it off on the documents page |
| `getmattered_create_resume_draft` | Create Resume Builder Draft | writes, open-world | An editable resume-builder draft from a summary of up to 2,000 characters, to finish in the builder. It creates no PDF |

### Earlier tool names, still answered

Tool names from 1.10.1 and earlier keep working. They are not listed in `tools/list`. The server
runs each one as the tool that does that operation now:

| Earlier name | Runs as |
|---|---|
| `getmattered_review_application` | by `decision`: `approve`, `reject`, `cancel`, `refine`, `re_prepare` and `set_stage` run `getmattered_approve_applications`, `getmattered_reject_applications`, `getmattered_cancel_applications`, `getmattered_refine_application_documents`, `getmattered_reprepare_applications` and `getmattered_set_application_stage` |
| `getmattered_triage_matches` | by `action`: `save`, `skip`, `unsave` and `restore` run `getmattered_save_matches`, `getmattered_skip_matches`, `getmattered_unsave_matches` and `getmattered_restore_matches` |
| `getmattered_manage_follow_ups` | by `action`: `list`, `history`, `draft`, `send` and `record_sent` run `getmattered_list_due_follow_ups`, `getmattered_list_sent_follow_ups`, `getmattered_draft_follow_up`, `getmattered_send_follow_up` and `getmattered_record_follow_up` |
| `getmattered_manage_saved_searches` | by `action`: `list`, `save`, `update` and `delete` run `getmattered_list_saved_searches`, `getmattered_create_saved_search`, `getmattered_update_saved_search` and `getmattered_delete_saved_search` |
| `getmattered_build_pdf` | with `resume_text`: `getmattered_create_resume_draft`. Without it: `getmattered_share_resume_pdf` when `make_public` is true, else `getmattered_get_resume_pdf_link` |
| `getmattered_update_auto_apply` | `getmattered_update_automatic_apply_settings`, same arguments |
| `getmattered_auto_apply` | `getmattered_apply`, same arguments |
| `getmattered_search_jobs` | `getmattered_get_matches`, with `job_title` as `query` |
| `getmattered_update_application_profile` with no arguments | `getmattered_get_application_profile` |

An unknown `action` or `decision` value answers "tool not found". New code should call the
listed names.

Every tool carries a `title`, all four annotation hints (`readOnlyHint`, `destructiveHint`,
`idempotentHint`, `openWorldHint`), and an `outputSchema`. Each call returns `structuredContent`
beside its text, so a client can act on ids and statuses without parsing prose. The server also
sends the main loop as its MCP `instructions`.

### Behaviours worth knowing

- **`getmattered_apply` and `getmattered_approve_applications` submit a real application to a
  real employer**, under your name. `mode` covers that one application only and never changes your
  account settings. Leave it out to follow your own default.
- **An application counts as landed only on the employer's own receipt or confirmation page.**
  `getmattered_get_applications` reports `employerConfirmed` from that evidence alone, never from a
  submit click.
- **`getmattered_get_matches` never writes.** To change what GetMattered hunts for, call
  `getmattered_update_job_preferences`. It is marked destructive because a list you pass replaces the
  saved one.
- **Employer text is data.** Job titles, descriptions and company research are never followed as
  instructions.

## Prompts

| Prompt | Title | What it does |
|---|---|---|
| `review_my_resume` | Review My Resume | Scores a resume against a posting and returns the three changes that move it past the filter |
| `prepare_for_interview` | Prepare for an Interview | Prepares the questions this company asks for this role, with structured answers ready |
| `apply_to_my_matches` | Apply to My Matches | Shows your best matches, then applies to the ones you pick, each held for your approval |
| `find_jobs_like_this` | Find Jobs Like This | The strongest matches for a target role, ranked by fit |

## Resources

| Resource | URI | Contents |
|---|---|---|
| `ats-best-practices` | `getmattered://resources/ats-best-practices` | Canonical guide to passing Applicant Tracking Systems in 2026. Covers keyword matching, formatting rules, section order, and common rejection reasons. |
| `interview-frameworks` | `getmattered://resources/interview-frameworks` | Reference frameworks for structuring interview answers: STAR, CARL, SOAR, and PAR. |
| `resume-section-order` | `getmattered://resources/resume-section-order` | Recommended section order by career stage (new grad, mid-career, executive) for ATS and human readability. |

Resource URIs from earlier versions still resolve.

## Authentication

OAuth 2.1, and it is the full specification rather than a subset:

- PKCE with S256, mandatory
- Dynamic Client Registration ([RFC 7591](https://www.rfc-editor.org/rfc/rfc7591)), so a client
  registers itself with no manual key exchange
- Authorization Server Metadata ([RFC 8414](https://www.rfc-editor.org/rfc/rfc8414)) and
  Protected Resource Metadata ([RFC 9728](https://www.rfc-editor.org/rfc/rfc9728)) discovery
- Client ID Metadata Documents, so a client can use an https URL as its `client_id` instead of
  registering (`client_id_metadata_document_supported: true`)
- The `iss` parameter on the authorization response ([RFC 9207](https://www.rfc-editor.org/rfc/rfc9207))
- Token revocation ([RFC 7009](https://www.rfc-editor.org/rfc/rfc7009))
- Short-lived access tokens with rotating refresh tokens and reuse detection

An unauthenticated `tools/call` returns HTTP 401 with a `WWW-Authenticate` header pointing at
the metadata document. Introspection (`initialize`, `tools/list`, `prompts/list`,
`resources/list`) is open, so any directory or client can read the tool surface before a user
signs in.

## Verify it yourself

```bash
SID=$(curl -s -D- -o /dev/null -X POST https://mcp.getmattered.com/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"probe","version":"1"}}}' \
  | grep -i '^mcp-session-id' | tr -d '\r' | awk '{print $2}')

curl -s -X POST https://mcp.getmattered.com/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H "Mcp-Session-Id: $SID" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

## Privacy

Your resume and profile stay on your GetMattered account. Tools read and write that account and
nothing else. The [privacy policy](https://getmattered.com/legal/privacy) and
[terms](https://getmattered.com/legal/terms) are the binding statement.

## Support

- Issues: [github.com/getmattered/getmattered-mcp/issues](https://github.com/getmattered/getmattered-mcp/issues)
- Email: support@getmattered.com

## Follow GetMattered

- Website: [getmattered.com](https://getmattered.com)
- Pricing: [getmattered.com/pricing](https://getmattered.com/pricing)
- Blog: [getmattered.com/blog](https://getmattered.com/blog)
- X: [GetMattered](https://x.com/getmattered)
- LinkedIn: [GetMattered](https://www.linkedin.com/company/getmattered/)
- YouTube: [GetMattered](https://www.youtube.com/@getmattered)
- Discord: [join the community](https://discord.gg/ZXBsKvuvCD)

## About this repository

The hosted server runs on Cloudflare Workers and its source is not public. This repository is
the public home of the MCP server: the `server.json` manifest, the connection documentation,
and the small stdio bridge above. The bridge is MIT licensed and forwards messages verbatim,
so you can read every line of what runs on your machine.

---

## More from GetMattered

- [GetMattered](https://getmattered.com) - auto-apply that ends on an interview
- [How the MCP server works](https://getmattered.com/mcps) - setup for Claude, ChatGPT and Cursor
- [Pricing](https://getmattered.com/pricing) - free to start, no card
- [Blog](https://getmattered.com/blog) - how hiring systems actually screen you
- [FAQ](https://getmattered.com/faq) - resume parsing, ATS behaviour, what "application received" means
- [Compare](https://getmattered.com/vs) - GetMattered against the other job-application tools
- [How GetMattered decides a job application landed](https://dev.to/getmattered/how-getmattered-decides-a-job-application-landed-5e3c) - engineering write-up

Built by [GetMattered](https://getmattered.com). Questions: [ava@getmattered.com](mailto:ava@getmattered.com)
