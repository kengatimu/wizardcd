# Update WizardCD Memory

Review everything done in this conversation session and update both `web/CLAUDE.md` and this skill file to reflect the current state of the project.

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
5. Update this skill file (`web/.claude/commands/update-memory.md`) — review the Rules section below and add any new rules or conventions discovered during the session that future updates must respect
6. Update the "Last updated" timestamp at the bottom of `CLAUDE.md` to today's date
7. After updating, confirm what was changed in both files

## Rules
- Never remove the "Files That Must Stay in Sync" section
- Never remove the "deploy.sh Key Variables" section — it prevents breakage
- Always keep the lib/ ZIP packaging rule visible
- Always update the TypeScript status line (clean / N errors)
- Do NOT rewrite sections that haven't changed — only edit what's new
- NEVER expose `newRatio` in the default UI
- All JVM fields use RowField row layout
- Only rollback the MOST RECENT change when user asks to rollback
- Project path for frontend edits: `/Users/bishop/Desktop/Bishop/Personal/EBB_Systems/WizardCd/web/ui/`
- Project root: `/Users/bishop/Desktop/Bishop/Personal/EBB_Systems/WizardCd/web`
- Runner VM SSH alias: `wizardcd-runner`, IP: `54.144.235.55`, port `8081`
- Target VM: `deploy@34.201.190.116:22`
- Colour tokens: `wiz-bg` < `wiz-surface` < `wiz-raised` < `wiz-panel` < `wiz-border` < `wiz-border-mid` < `wiz-border-strong`
- Signal colours: sig-blue (SIT), sig-yellow (UAT), sig-purple (PROD), sig-green, sig-red, sig-orange, wiz-gold, wiz-violet
- `departed` vs `visited` step tracking: errors only show on departed steps
- Draft banner and Recent Deployments card are mutually exclusive — never show both
