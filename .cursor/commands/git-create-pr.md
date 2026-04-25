Cleanup the git history for a pull request. Idempotent — works for both new and existing PRs, preserving all commit history across runs.

**End state (same whether creating or updating):**

- `<my-new-branch>` on remote: one squashed commit ahead of target, with a PR open
- `pre-squash/<my-new-branch>` local only: full un-squashed commit history accumulated across all runs (local ledger/audit trail, never pushed to remote)

**Steps to execute (ask for confirmation before each step):**

Note: You may use the following tools as needed:

- git
- GitHub CLI
- the gitKraken MCP

1. Ask me which branch I want to merge this one into (default to 'dev')
2. Determine the working branch:
   - Note the current branch name
   - If on a `pre-squash/` branch, strip the prefix to get `<my-new-branch>`
   - Otherwise, the current branch IS `<my-new-branch>`
3. Check if a PR already exists for this branch:
   - `gh pr view <my-new-branch> --json number,title,body 2>/dev/null`
   - Note whether we're **creating** or **updating** a PR
4. Gather all commits ahead of the target branch: `git log <target-branch>..HEAD --oneline`
   Take a note of each commit and its message. Use the `commit` command for guidance on generating good commit messages. These will be used to:
   - generate a concise conventional commit message for the single squashed commit
   - generate a useful PR description
5. Push the branch as-is to ensure we don't lose any work: `git push -u origin HEAD --force-with-lease`
6. Ensure the target branch is up to date:
   - `git fetch --all`
   - `git checkout <target-branch>`
   - `git pull origin <target-branch>`
7. Build the pre-squash branch (preserving all commit history):

   **Case A — First run (`pre-squash/<my-new-branch>` does NOT exist):**
   - `git checkout <my-new-branch>`
   - `git rebase -X theirs <target-branch>`
   - `git branch -m pre-squash/<my-new-branch>`

   **Case B — Re-run, currently on the pre-squash branch:**
   - `git rebase -X theirs <target-branch>`
   - `git branch -D <my-new-branch>` (delete old squashed branch if it exists, ignore errors)

   **Case C — Re-run, currently on the squashed branch (`<my-new-branch>`):**
   - Rebase both branches onto target:
     - `git checkout <my-new-branch>`
     - `git rebase -X theirs <target-branch>`
     - `git checkout pre-squash/<my-new-branch>`
     - `git rebase -X theirs <target-branch>`
   - Find the previous squash commit (oldest commit on `<my-new-branch>` ahead of target):
     - `SQUASH_SHA=$(git log <target-branch>..<my-new-branch> --reverse --format=%H | head -1)`
   - Cherry-pick new commits (everything after the squash) onto pre-squash:
     - `git cherry-pick $SQUASH_SHA..<my-new-branch>`
     - Skip this if there are no commits after the squash (i.e., nothing new was added)
   - Delete the old squashed branch: `git branch -D <my-new-branch>`

8. Create the squashed branch from pre-squash, then commit & push:
   - `git checkout <target-branch>`
   - `git merge --squash pre-squash/<my-new-branch>`
   - `git checkout -b <my-new-branch>`
   - `git commit -m "<type>(<optional scope>): <description>"` (use the commit message from step 4)
   - `git push -f`
9. Create or update the PR. The title should be the commit description. The body should be the summary/list of changes from step 4:
   - **New PR**: `gh pr create --body <string> --title <string> -B <target-branch>`
   - **Existing PR**: `gh pr edit --body <string> --title <string>`
