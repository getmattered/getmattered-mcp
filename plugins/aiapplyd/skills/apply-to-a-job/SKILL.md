---
name: apply-to-a-job
description: Send a real job application with AI Applyd, which fills in and submits the employer's own hiring form (Workday, Greenhouse, Lever, Ashby, iCIMS and 10 more ATS platforms). Use this skill whenever the user wants to apply to a job, send or submit an application, auto-apply, 'go ahead and apply', or apply to one of their matches, even if they only paste a job link and say 'apply'.
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
