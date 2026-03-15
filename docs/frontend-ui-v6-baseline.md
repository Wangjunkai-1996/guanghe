# V6 Frontend UI Baseline

Date: 2026-03-15

## Visual Direction

- Theme: dark industrial console
- Priority: desktop-first operations efficiency
- Shell: fixed left rail + heartbeat topbar + right workspace
- Workspaces: `批量闭环` primary, `快速验证` secondary

## Implemented Baseline

- Global V6 shell with consolidated status heartbeat and reduced duplicate navigation.
- Batch workspace rebuilt into `mission panel + queue workplane + inspector`.
- Mission panel compressed into a readiness stepper, locked target fields, one primary CTA, and secondary tools.
- Task queue keeps state during refresh, supports keyboard selection, and uses inspector-driven detail flow.
- Demand queue moved behind an explicit tab switch with a dedicated inspector.
- Manual workspace simplified into a lighter supporting tool area with command-bar style query flow.
- Loading and error behavior aligned to “keep existing data visible during refresh”.

## V5 To V6 Differences

- V5 was a stacked card page; V6 is a desktop dispatch console with a stable shell.
- V5 repeated explanatory copy across modules; V6 reduces copy and keeps blockers inline.
- V5 split preparation, demand, and execution into large equal sections; V6 gives priority to queue + inspector.
- V5 treated quick verify as another main page; V6 clearly subordinates it to batch operations.
- V5 relied on layered overrides; V6 uses a dedicated console theme layer and shared visual semantics.

## Acceptance Notes

- `npm test`: passed
- `npm run build`: passed
- Horizontal overflow: not observed at `1440 / 1024 / 768 / 390`
- Batch desktop at `1440`: readiness heading, primary CTA, queue header, and inspector heading are all visible in the first viewport
- Tablet widths (`1024 / 768`) intentionally collapse into a linear workflow layout while preserving the same data model
- Manual mobile at `390` remains usable and visually subordinate to the batch workspace

## Screenshot Outputs

- `artifacts/ui-v6/batch-desktop.png`
- `artifacts/ui-v6/batch-tablet.png`
- `artifacts/ui-v6/batch-768-check.png`
- `artifacts/ui-v6/manual-desktop.png`
- `artifacts/ui-v6/manual-mobile.png`
