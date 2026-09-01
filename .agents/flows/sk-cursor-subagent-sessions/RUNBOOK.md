# Flow Runbook: cursor-subagent-sessions

Status: in-progress

Goal: Determine how to distinguish Cursor main sessions from subagent sessions in happenin.

| #   | Phase          | State   | Artifact                                           | Summary                                                                                                                            | Divergence / Notes |
| --- | -------------- | ------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| 0   | Explore        | done    | [0 - EXPLORE.md](0%20-%20EXPLORE.md)               | happenin does not currently distinguish main/subagent sessions; the data may already exist in raw payloads                         |                    |
| 1   | Alternatives   | done    | [1 - ALTERNATIVES.md](1%20-%20ALTERNATIVES.md)     | Decision: extract subagent_id, subagent_type, transcript_path from subagentStart payloads at record time; defer transcript import. |                    |
| 2   | Planning       | done    | [2 - PLANNING.md](2%20-%20PLANNING.md)             | Additive DB columns for subagent metadata, record/backfill extraction, dashboard/query exposure, tests, and fail-open hook path.   |                    |
| 3   | Implementation | done    | [3 - IMPLEMENTATION.md](3%20-%20IMPLEMENTATION.md) | Added subagent columns/migration/backfill, record extraction, view/dashboard exposure, and tests. All verification checks passed.  |                    |
| 4   | Review         | done    | [4 - REVIEW.md](4%20-%20REVIEW.md)                 | One nit fixed: added errcode 6 and extended locked (262) coverage for isBusyError. Re-review: Lean & valid. Ship.                  |                    |
| 5   | Verify         | done    | [5 - VERIFY.md](5%20-%20VERIFY.md)                 | build, typecheck, test:ci, lint:ci, format:ci, duplicates:ci, knip:ci all passed.                                                  |                    |
| 6   | PR             | pending | [6 - PR.md](6%20-%20PR.md)                         |                                                                                                                                    |                    |

## Divergence log

- Removed `.agents/flows/sk-*/` from `happenin/.gitignore` because it blocked agent access. User later removed `.agents/flows/` entirely, so flow files are now accessible and the original gitignore concern is resolved.
