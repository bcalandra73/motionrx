# Changelog

Running log of meaningful changes to MotionRx. Most recent at the top.

Each entry: date, what changed in plain language, and any follow-ups the change leaves behind. New entries get added by Claude Code after any user-visible or behavioural change — see `CLAUDE.md` for the convention.

---

## 2026-05-13 — Documentation overhaul for handoff

Restructured project documentation in preparation for handing the project to a new maintainer working through Claude Code:

- Rewrote `README.md` as a non-technical front door (install prerequisites, getting started, working with Claude Code, prompt examples, breakage recovery, glossary).
- Restructured `CLAUDE.md` as a focused technical brief. Added an "About the maintainer" section codifying the plan-first / branch-by-default working style, and an explicit "Architecture invariants" section listing load-bearing behaviours not to change unilaterally.
- Created `docs/` for in-depth references. Moved the movement-analysis module layout, MediaPipe landmark indices, and the recipe for adding a new movement type into `docs/architecture.md`. Moved the `test.yaml` schema and pipeline-runner usage into `docs/test-data.md`. `docs/running-analyzer.md` was already in place.
- Seeded this changelog.

No code changes.
