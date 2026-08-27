---
name: gh-issue
description: Pull a GitHub issue from bini59/321_auth, read its body + comments, grill the scope with the user, then hand off to the planner agent. Trigger when the user wants to start work from an issue, "pull an issue", "이슈 가져와", "가져와", or names an issue number/URL.
---

# GitHub Issue Intake

Pull a GitHub issue → clarify → grill the scope → planner. Work is tracked **entirely as GitHub issues** in **bini59/321_auth** (no external tracker); this skill carries one issue from picked to ready-to-plan.

## Steps

### 1. Pick or create the issue
- Named/linked a specific issue → `gh issue view <number> --repo bini59/321_auth --comments`.
- Browsing → `gh issue list --repo bini59/321_auth --assignee @me --state open` (fallback: drop `--assignee` for all open). List them and ask which one.
- Starting fresh with no issue yet → `gh issue create --repo bini59/321_auth` (confirm title + body with the user before creating).

### 2. Read it fully
- `gh issue view <number> --repo bini59/321_auth --comments` — read the body AND every comment. Scope context often lives in the discussion, not the body.
- Summarize back to the user: what the issue asks, key constraints, open questions you spotted.

### 3. Grill the scope (the important part)
Do NOT rush to planning. Run a `$grill-with-docs` session (grilling + domain-modeling), using the issue body/comments as the starting plan. 스코프를 파고드는 동시에 확정된 용어·결정을 `CONTEXT.md`/ADR로 적어나간다. Interview the user relentlessly until scope is shared and clear:
- What's the concrete deliverable? Acceptance criteria?
- Which routes/services/types does this touch? (use graphify / the codebase to answer instead of asking, where you can)
- Anything ambiguous in the issue → resolve it now.
Keep the issue updated with anything material that surfaces: `gh issue comment <number> --repo bini59/321_auth --body "..."`.

### 4. Hand off
Delegate to the **planner** agent with: the grilled scope, the issue link, and the touched-files notes. Planner does track determination + `tmp/TODO.md`. Stop here — don't plan or implement in this skill.

## Notes
- Everything is a GitHub issue — no external tracker. Any new work gets an issue first (step 1).
- Don't create an issue without showing the user the title + body first.
- Don't skip step 3 — grilling the scope before planning is the whole point.
