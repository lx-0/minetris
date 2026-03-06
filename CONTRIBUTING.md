# Contributing

## Branch Policy

All changes go through pull requests. Direct commits to `main` are not allowed.

**Allowed without a PR** (honor system, must reference the issue):
- Typo fixes
- Comment-only changes
- Documentation updates

**Requires a PR** (no exceptions):
- Code logic changes
- Configuration changes
- New features or bug fixes

## PR Rules

- Branch name format: `<issue-id>-short-description` (e.g. `YES-12-add-scoring`)
- PR title format: `[YES-N] Short description` (e.g. `[YES-12] Add scoring system`)
- At least **1 approval required** before merge
- **No force pushes** to `main`
- Approvals are dismissed when new commits are pushed — re-review required after changes
- The person who pushed the last commit cannot be the approver (no self-approval)
- All review threads must be resolved before merge
- Once CI is set up: CI must pass before merge

## Workflow

1. Create a branch from `main`
2. Make your changes
3. Open a PR with the issue identifier in the title
4. Request review — address all comments before merging
5. Merge after approval (squash or merge commit)
