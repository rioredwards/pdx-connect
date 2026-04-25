Create a new branch and commit changes with an auto-generated message. The branch name follows the pattern `re/<type>/<description>` based on the commit message.

**Steps to execute (do all automatically without asking):**

1. Follow the same logic as the `git-commit.md` command to generate a commit message (check git status/diff, review README TODO, determine commit grouping, generate conventional commit message).

2. Extract the `<type>`, `<scope>`, and `<description>` from the commit message to create the branch name:

   - Branch name format: `re/<type>/<scope>/<description-kebab-case>`
   - Convert `<description>` to kebab-case (lowercase, replace spaces/special chars with hyphens)
   - **If the description would result in more than 4-5 words in the branch name, use an abbreviated/high-level/more-broad version instead:**
     - Focus on the main intent or high-level change rather than specific implementation details
     - Remove unnecessary words, articles, and qualifiers
     - Keep only the essential action and subject
   - Examples:
     - `feat(auth): add login functionality` → `re/feat/auth/add-login`
     - `fix(navigation): resolve mobile menu toggle issue` → `re/fix/navigation/mobile-menu-toggle`
     - `chore: update dependencies` → `re/chore/update-deps` # note, scope is omitted because it's not present in the commit message
     - `refactor(api): extract configuration to separate file` → `re/refactor/api/extract-config` (abbreviated from "extract-configuration-to-separate-file")
     - `feat(components): add new user profile card component with avatar and bio` → `re/feat/components/add-user-profile-card` (abbreviated from "add-new-user-profile-card-component-with-avatar-and-bio")

3. Create the new branch: `git checkout -b re/<type>/<scope>/<description-kebab-case>`

4. Stage and commit the changes using the same logic as `git-commit.md` (stage files, commit with generated message).

**Important:** Do NOT ask for confirmation or user input. Execute all steps immediately and automatically.
