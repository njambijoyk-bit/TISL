<?php

namespace App\Services\BulkImport;

/**
 * One thing that can be bulk imported (ingredients, products, hampers...). The engine knows nothing about the thing itself:
 * it asks the entity for its module, its columns and what it depends on, then hands it each record to store.
 *
 * `store()` is called inside a database savepoint. It must do its work through the module's own services (so every rule the screens enforce also
 * applies here), and throw a RowProblem (or a BooksException / ValidationException) to refuse the record. It must not touch anything outside the
 * database (files, mail, queues): the same code runs for the preview, which is rolled back.
 */
interface ImportEntity
{
    /** Unique key, "module.thing" (menus.ingredients). */
    public function key(): string;

    /** The module that must be licensed and switched on (menus, ecommerce...). 'core' is always on. */
    public function module(): string;

    public function label(): string;

    public function description(): string;

    /** @return Column[] */
    public function columns(): array;

    /** The column that ties several rows into one record (a recipe's name over its ingredient lines), or null when every row is a record. */
    public function groupBy(): ?string;

    /**
     * What must already be in the system. Each: ['label' => 'Ingredients', 'entity' => 'menus.ingredients', 'present' => fn(): bool].
     * When one is missing nothing is read at all, and the answer says what to import first.
     *
     * @return array<int, array{label: string, entity: ?string, present: callable}>
     */
    public function requires(): array;

    /** Quick row-level checks before anything is written: references that must exist, conflicts inside the record. Throw RowProblem for the first. */
    public function check(array $record, ImportContext $ctx): void;

    /** What makes a record the same one as another in the same file (usually its lowercase name), or null when repeats are fine. */
    public function identity(array $record): ?string;

    /** Create the record. @param array<string, mixed> $record column key => cleaned value; a grouped entity gets 'rows' => the per-row arrays too */
    public function store(array $record, ImportContext $ctx): void;

    /** Sample rows for the template (column key => value). */
    public function examples(): array;
}
