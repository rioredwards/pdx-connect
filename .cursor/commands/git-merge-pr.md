Merge a pull request locally after it has been reviewed and approved on GitHub.

**Context:**
After a PR has been reviewed and approved on GitHub (but not yet merged), you can merge it locally instead of clicking "Merge" on GitHub. When you push the target branch, GitHub will recognize this as the PR merge if the commit sha's line up with those from the PR. This is an alternative to merging via the GitHub UI.

**Steps to execute (ask for confirmation before each step):**

Note: You may use the following tools as needed:

- git
- GitHub CLI
- the gitKraken MCP

1. Ask me which branch contains the PR changes (the feature branch to be merged)
2. Ask me which branch the PR should be merged into (default to 'dev')
3. Ensure the target branch is up to date:
   - `git checkout <target-branch>`
   - `git fetch --all`
   - `git pull`
4. Merge the feature branch into the target branch using fast-forward only (this ensures the commit sha's match):
   - `git merge --ff-only <feature-branch>`
5. Push the updated target branch to remote: `git push`
