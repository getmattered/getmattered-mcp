---
name: find-matching-jobs
description: Find jobs that fit the user's resume with AI Applyd. Use when the user asks for job matches, openings, roles to apply to, or wants to change the roles or locations they are searching for.
---

# Find matching jobs

1. Call `aiapplyd_search_jobs` with the job title the user wants (at least 2 characters).
   Add `location` when they name a city or country, and `remote_only: true` when they only want remote work.
2. Show the top results as a short list: title, company, location, salary if present, and match score.
   Include each job's URL so the user can open it.
3. If nothing matches, say so plainly and offer two next steps: a broader title, or updating the
   saved search with `aiapplyd_update_job_preferences`.
4. To change what AI Applyd searches for, call `aiapplyd_update_job_preferences` with at most five
   `target_roles` and five `locations`. Use "Remote anywhere" for worldwide remote work.

Results come from the user's own curated matches, not the whole web. Say that when it explains a
short or empty list.
