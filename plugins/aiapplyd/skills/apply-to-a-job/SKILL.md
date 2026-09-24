---
name: apply-to-a-job
description: Send a job application with AI Applyd, which fills and submits the employer's own hiring form. Use when the user asks to apply to a job, send an application, or auto-apply to a match.
---

# Apply to a job

1. Get the job's URL: the posting link from a search result or one the user pastes.
2. Confirm once before sending: applying submits a real application under the user's name.
3. Call `aiapplyd_auto_apply` with `job_url`.
4. Report what came back. An application counts as sent only when the employer's system confirms
   it. If the tool reports the application as queued or in progress, say so, and tell the user they
   can follow it in their AI Applyd dashboard at https://aiapplyd.com/dashboard/applications.
5. If the tool says the user's plan does not cover applying, pass on the message as written and
   link https://aiapplyd.com/pricing.

Never invent a confirmation. Report only what the tool returned.
