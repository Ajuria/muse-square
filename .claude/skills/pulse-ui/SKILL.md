---
name: pulse-ui
description: Make a UI change to the Muse Square Pulse/Monitor/Insight surfaces grounded in the app's real design system. Use before editing OR prototyping any card, menu, panel, button, chip, or workspace UI. Forces reading the actual component (class, CSS, markup) and reusing existing tokens/classes instead of inventing — the fix for prototypes that drift from the system.
---

# pulse-ui

UI changes here fail when designed in the abstract (invented colors, bespoke control shapes, imagined interactions). Ground every change in the app's REAL system before writing or prototyping. Never invent a color, size, or control shape.

## Before touching any UI
1. **Locate the real component** you're modifying or sitting beside — grep the class + its CSS + its builder, and quote the actual values before proposing anything:
   - Cards: `.ab-card`, `.ab-summary`, `.ab-pills`, `.chip-n`, `.ab-what`, `.ab-sowhat` (pulse.astro `<style is:inline>`).
   - Menu: `.ab-agir-dropdown` (rounded 8px), `.ab-dd-item` (icon tile + label + desc), `.ab-dd-icon` + `-comm`/`-send`/`-see` tinted tiles — built in `menuHtml` (pulse.astro ~1659).
   - Workspace / panel: `buildWorkspaceHtml` + the recipient block (`_teamMembersCache`, `data-ws-recipient` / `data-ws-pick-member`).
2. **Match the nearest existing affordance exactly.** A dropdown row is a `.ab-dd-item` (icon tile + label + desc), NOT a standalone button. A status is a `chip-n`. A primary action is the outlined blue button. Do not introduce a new control shape or size.
3. **Colors: `src/styles/design-tokens.css` vars or existing classes only.** No new hex. Reuse `ab-dd-icon-send` etc. `#1D3BB3` (data-blue) is NOT tokenized — match the literal, and never substitute `--color-brand-blue` (#0b37e5) for it.
4. **Injected HTML.** pulse's `<style is:inline>` is global, so its classes DO reach injected markup — prefer reusing those classes; inline-style only genuinely new bits (per CLAUDE.md). Emoji in inline scripts → `\uXXXX` via a python `chr(92)` pass (the Edit tool normalizes hand-typed escapes).

## Prototype-first (standing rule)
- Prototype UI changes for approval BEFORE editing the live surface.
- Build the prototype from the REAL pulled CSS/markup (grep it — don't approximate). An approximated mock is what makes a proposal read as off.

## Self-check (this project's past failure modes)
- [ ] No invented color — every hue traces to a token or existing class.
- [ ] Control matches an existing shape/size (dropdown row / chip / button), not a bespoke one.
- [ ] Interaction reflects the real component (e.g. the actual Agir menu structure), not an imagined one.
- [ ] Reuses the real container (`.ab-workspace`) and helpers (`_teamMembersCache`), not a parallel invention.
- [ ] Prototyped and approved before the `.astro` edit.

See CLAUDE.md (Frontend, Data Path); memory: design-tokens-usage.
