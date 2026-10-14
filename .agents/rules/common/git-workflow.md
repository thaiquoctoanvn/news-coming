# Git Workflow

## Commit Message Format
```
<type>: <description>

<optional body>
```

Types: feat, fix, refactor, docs, test, chore, perf, ci

### Project rules (override — always apply)

- **Short:** at most 2 lines — the subject line, plus one optional body line. No bullet lists.
- Subject ≤ 72 characters.
- **No AI attribution:** never add `Co-Authored-By` trailers for AI tools, "Generated with …" lines, or any AI/assistant/model name to commit messages.

```
feat: add topic-based schema and RLS migrations
Seed macro_finance topic with verified sources.
```

## Pull Request Workflow

When creating PRs:
1. Analyze full commit history (not just latest commit)
2. Use `git diff [base-branch]...HEAD` to see all changes
3. Draft comprehensive PR summary
4. Include test plan with TODOs
5. Push with `-u` flag if new branch

