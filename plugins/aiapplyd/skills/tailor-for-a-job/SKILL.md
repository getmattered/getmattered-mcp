---
name: tailor-for-a-job
description: Tailor the user's resume and cover letter to one job posting with AI Applyd. It gives an ATS score, missing keywords, a rewritten resume, a cover letter, a PDF and interview questions. Use this skill whenever the user pastes a job description, asks how well their resume fits a role, wants their resume rewritten or optimized for a job, needs a cover letter, or wants to prepare for an interview.
---

# Tailor for a job

1. Ask for the job description and the company name if the user has not given them. Use the full
   posting text, not a summary. Ask the user to paste their resume text too.
2. Call `aiapplyd_analyze_job_description` to pull out the keywords and must-have requirements.
3. Call `aiapplyd_score_resume` with `resume_text` and `job_description` to show how the current
   resume reads against that posting.
4. Call `aiapplyd_optimize_resume` with the same two fields to rewrite the resume for the role,
   then `aiapplyd_generate_cover_letter` with `job_description` and `company_name`.
5. When the user wants a file, call `aiapplyd_build_pdf` with the rewritten `resume_text`.
6. For interview practice, call `aiapplyd_generate_interview_questions` with `job_title`,
   `company_name` and the `job_description`.

These tools use the user's AI Applyd credits. Tell the user before running a long chain of them.
