Automatically stage changes and create a commit (or multiple commits) with an auto-generated message.

**Steps to execute (do all automatically without asking):**

1. Use git diff and git status to see what files have changed
2. Check the TODO list in the README.md file to see if any tasks have been completed. If the changes are clearly related to a specific task, use that task name to inform what files should be committed and what the commit message should be.
3. Determine if the changes should be grouped into one commit or split into multiple commits.

- For a single commit, the changes should be generally related... either to a single component/feature or a single type of change (e.g. formatting, refactoring, etc.). Small miscellaneous changes should be grouped into a single commit.
- For multiple commits, the changes should be unrelated... either to different components/features or different types of changes (e.g. formatting, refactoring, etc.).
- Proceed with the following steps for each commit.

4. Stage all changes related to the commit: `git add .`
5. Generate a concise commit message based on the changes:

- Review the changed files and their diffs if needed
- Use conventional commit format:

```bash
git commit -m"<type>(<optional scope>): <description>" \
-m"<body (very optional)>" \
-m"<footer (almost never needed)>"
```

- Examples of good commit messages:

```
feat(auth): add user login functionality
```

```
feat(components): add data table component
```

```
style(theme): update color scheme and typography
```

```
fix(navigation): resolve mobile menu toggle issue
```

```
refactor(api): improve error handling
```

```
chore: update dependencies
```

```
docs: update README with setup instructions
```

5. Commit: `git commit -m "generated message"`

**Important:** Do NOT ask for confirmation or user input. Execute all steps immediately and automatically.
**Important:** THE COMMIT MESSAGE SHOULD BE CONCISE AND TO THE POINT. IT SHOULD NOT BE A LONG PARAGRAPH. IT SHOULD IDEALLY BE A SINGLE SENTENCE THAT DESCRIBES THE CHANGES. THE INTENT OF OF THE CHANGE IS MORE IMPORTANT THAN THE SPECIFIC IMPLEMENTATION DETAILS, SO KEEP IT SOMEWHAT HIGH-LEVEL IF POSSIBLE!

- **IMPORTANT:** Use appropriate scopes based on what was actually changed:
  - `(AI)` - for `.cursor/commands/` or AI-related configuration files
  - Component names, feature names, or module names - for specific components, features, or modules
  - `(lib)` or `(utils)` - for utility files
  - `(styles)` or `(theme)` - for styling files
  - `(config)` - for configuration files
  - No scope needed for general changes or when scope is unclear
