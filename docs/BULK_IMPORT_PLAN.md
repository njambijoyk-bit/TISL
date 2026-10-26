# Bulk import engine (Extras)

Extras → Bulk import. One engine, many importable things. Built in `backend/app/Services/BulkImport`, screen at `/admin/bulk-import`.

## Rules

- **Gated twice.** The engine needs the **Extras** module licensed and on. Each thing then needs *its own* module licensed and on (Menus, E-commerce...). Off or unlicensed, it is shown greyed with the reason, and an import is refused with `module_off` / `module_not_licensed`.
- **Permission per module.** `bulkimport.<module>` (`bulkimport.menus`, `bulkimport.ecommerce`, `bulkimport.memberships`, ... and `bulkimport.core` for Core things). A role without it does not see that module's things and gets 403 if it tries. Catalogue version 19; super admin and admin hold them by default, other roles do not.
- **All or none.** The whole file runs in one database transaction, each record in its own savepoint. A refused record is noted and the next is still tried, so the answer lists *every* problem; commit happens only when there are none. A preview is the same run, rolled back, so it says exactly what a real import will do.
- **Real rules, not copies.** Records are stored through the module's own services (`Ingredients::save`, `DishRecipes::saveStandalone`, `VariantStockService`, `TradingAccounts::problem`...), so everything the screens enforce is enforced here.
- **Dependencies.** An entity declares `requires()` (a recipes file needs ingredients in the system) and row-level references (an ingredient name, a category, a product SKU, a sales account). Missing → `dependency_missing` / `unknown_reference`, naming what to import first.
- **Create only.** An existing name/SKU is `already_exists`; updating existing records is not part of v1.

## Errors

`{ row, column, code, message }`; row 0 = the file or setup as a whole; row numbers count the headings as row 1.

`module_off`, `module_not_licensed`, `dependency_missing`, `unsupported_format`, `unreadable_file`/`invalid_json`/`invalid_xml`/`invalid_xlsx`/`invalid_markdown`, `empty_file`, `no_headings`, `file_too_big`, `too_many_rows`, `unknown_column`, `missing_column`, `duplicate_column`, `required`, `invalid_value`, `already_exists`, `unknown_reference`, `duplicate_in_file`, `conflicting_values`, `not_allowed`, `rejected` (the module's own rule, message verbatim), `unexpected`.

## Formats and templates

csv (`,` `;` tab or `|`, BOM and Excel's old encoding handled), json (`[...]` or `{"rows": [...]}`), xml (`<rows><row>...`), xlsx (sheet `Data`; the template adds a `Guide` sheet), markdown (first pipe table). Every thing has a downloadable template per format: `GET /admin/bulk-import/{key}/template/{format}`. Headings match by key, label or alias, ignoring case/spaces/underscores; the screen lets the person map or skip headings that don't match. Lists (allergens, variants) use `;`.

## What is importable now

| Key | Module | Needs |
|---|---|---|
| `menus.ingredients` | menus | units |
| `menus.recipes` (one row per line, grouped by recipe name) | menus | ingredients |
| `ecommerce.categories` | ecommerce | — |
| `ecommerce.products` | ecommerce | categories, a sales account, units. No opening stock: that needs a cost and a voucher, so it is received on the stock screens |
| `ecommerce.services` | ecommerce | a Service Income account |
| `ecommerce.hampers` (one row per item, grouped by hamper name) | ecommerce | products, in stock at the hamper's branch |

## Adding a thing

Implement `ImportEntity` (extend `AbstractEntity`), list it in `ImportRegistry::ENTITIES`. Declare module, columns (mark `perRow` columns of grouped things), `requires()`, `check()` for references and `store()` through the module's service. Nothing outside the database in `store()`: it also runs for previews.

## Later

Core imports (customers, employees) move onto this engine from `app/Imports`; employees should also require `hr.manage`. Memberships, events and courses next. Update-existing mode.
