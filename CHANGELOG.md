# Changelog

## 1.9.0

The assistant bundle has fourteen job-search skills. Four new skills cover the tool map, recruiter replies, follow-ups and saved searches.

New tools on the hosted server:

- `aiapplyd_get_inbox` reads the emails employers sent to the user's AI Applyd address, with drafted replies for a conversation. Sign-up codes and other account mail are marked and never count as an employer reply.
- `aiapplyd_reply_to_email` sends the user's reply to an employer. Skills show the exact text first and send only after the user says yes to it.
- `aiapplyd_update_auto_apply` turns Auto Apply on or off and sets review or auto mode, the daily limit and the lowest match. Turning it on or choosing auto mode needs the user's yes.
- `aiapplyd_update_application_profile` reads and saves the answers employer forms need, and lists the details recent applications had to guess.
- `aiapplyd_manage_follow_ups` lists due follow-ups, drafts one, sends it from a connected Gmail or Outlook after the user's yes, or records one the user sent.
- `aiapplyd_manage_saved_searches` saves the current job preferences as a named search and turns email alerts for new matches on or off.

Changed behavior:

- `aiapplyd_score_resume`, `aiapplyd_optimize_resume` and `aiapplyd_translate_resume` take `resume_text` for a resume pasted in the chat, or `resume_file` for a file attached in ChatGPT. `aiapplyd_generate_cover_letter` takes `resume_text`. Without them, the tools use the resume on file.
- Translation and cover letters no longer need a resume-builder document.
- `aiapplyd_set_resume` also takes `resume_file`.
- `aiapplyd_build_pdf` with no `resume_text` returns the PDF link of the resume on file and creates nothing.

Skills:

- `using-ai-applyd` maps each request to its tools and order, lists the actions that need the user's yes, and ends each result with one next step offered to the user, with no prices or billing links.
- `handle-recruiter-replies`, `follow-up-on-applications` and `manage-saved-searches` are new.
- The apply, setup, tailoring, cover letter, translation, resume document, matching, tracking and interview skills describe the new resume sources and point to the new workflows. `apply-to-a-job` covers Auto Apply settings.

The package, registry/npm manifest, client manifests, root lockfile metadata and CLI version output use 1.9.0. The prepublish check expects fourteen skills. Dependency versions are unchanged.

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
