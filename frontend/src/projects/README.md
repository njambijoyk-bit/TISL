# Projects module (rebuilt)

Plan: `docs/PROJECTS_CRM_PLAN.md`. Stage 1 spec: `docs/PROJECTS_STAGE1_SPEC.md`.

The old module was removed in build 1.1. Screens arrive build by build.

## Rules for every file in this folder

- **No colour and no font is written here.** Use the theme's named values only: `var(--color-primary-*)`, `var(--surface-card)`,
  `var(--surface-input)`, `var(--surface-hover)`, `var(--line)`, `var(--text-primary)`, `var(--text-secondary)`,
  `var(--status-success | warning | error | info)`, `var(--font-heading)`, `var(--font-body)`. Tints are made with
  `color-mix(in srgb, var(--token) N%, transparent)`. `frontend/scripts/check-projects-theme.mjs` fails the lint on a colour
  value, a named colour, a Tailwind palette class or a font name.
- **Words come from the names table**, never typed in: "Matter", "Contract" and "Job" are the same field.
- **Buttons carry the standard names** (New…, Filters, Export, Trash, Switch view, Configuration, Save, Close) so the TISL function
  keys find them (`_shared/lib/pageHotkeys.js`).
- **Money is never kept here.** A figure on a project screen is read from the books.

- `pages/admin/` — staff screens
- `components/` — building blocks shared by the screens
- `lib/` — naming, access and formatting helpers
