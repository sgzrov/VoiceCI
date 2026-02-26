# VoiceCI Agent Guidelines

## Workflow Orchestration

Important: PRODUCTION-ONLY fixes, no localhost.

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately – don't keep pushing
- Use plan mode for verification steps, not just building
- Before planning, use web search and search up best practices and competitor (Hamming, Roark, Coval, etc) practices
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- `git diff` before/after; match your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Honest Elegance (balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky, "knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes – don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report, just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests – then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told to

## Task Management
- **Plan First**: Write plan to `tasks/plan.md` with checklist items
- **Verify Prereqs**: Check plan before starting implementation
- **Track Progress**: Mark items complete as you go
- **Validate Changes**: High-level summary at each step
- **Document Results**: Add review section to `tasks/plan.md`
- **Capture Lessons**: Update `tasks/lessons.md` after corrections
- **Backward Compatability**: Don't worry about backward compatability.

## Commit Messages

Use `type: small description` format for commits.

| Type       | When to use                                              |
|------------|----------------------------------------------------------|
| `feat`     | New user-facing feature                                  |
| `fix`      | Bug fix                                                  |
| `refactor` | Code restructuring (no feature or fix)                   |
| `perf`     | Performance improvement                                  |
| `docs`     | Documentation only                                       |
| `test`     | Add or modify tests only                                 |
| `chore`    | Maintenance (tooling, deps, scripts) — no runtime change |
| `build`    | Build system / deps affecting build output               |
| `ci`       | CI configuration changes                                 |
| `style`    | Formatting only (no logic change)                        |
| `revert`   | Revert a prior commit                                    |

