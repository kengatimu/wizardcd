# Update WizardCD Memory

Review everything done in this conversation session and update `web/CLAUDE.md` to reflect the current state of the project.

## Instructions

1. Read the current `web/CLAUDE.md`
2. Review what was changed or built in this session (check the conversation history)
3. Update `CLAUDE.md` with:
   - Any new files created or significantly changed
   - Any new patterns, conventions, or architectural decisions made
   - Move completed items into the "What Has Been Completed" section
   - Update "Pending / Known Issues" section
   - Correct any outdated information (e.g. if a field was renamed)
   - Add any new DTO fields, API endpoints, or UI panels introduced
4. Keep the file concise — do NOT add every small detail, only things needed to resume work in a new session
5. After updating, confirm what was changed in the summary

## Rules
- Never remove the "Files That Must Stay in Sync" section
- Never remove the "deploy.sh Key Variables" section — it prevents breakage
- Always keep the lib/ ZIP packaging rule visible
- Always update the TypeScript status line (clean / N errors)
- Do NOT rewrite sections that haven't changed — only edit what's new
