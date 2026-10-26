<?php

namespace App\Services\BulkImport;

/** Defaults most things share: one row per record, nothing required first, no extra checks. */
abstract class AbstractEntity implements ImportEntity
{
    public function groupBy(): ?string
    {
        return null;
    }

    public function requires(): array
    {
        return [];
    }

    public function check(array $record, ImportContext $ctx): void
    {
    }

    public function identity(array $record): ?string
    {
        return isset($record['name']) ? mb_strtolower(trim((string) $record['name'])) : null;
    }

    /** A column of this entity by key. */
    protected function required(string $key, string $label, string $type = 'text', array $more = []): Column
    {
        return Column::make($key, $label, $type)->with(['required' => true] + $more);
    }

    protected function optional(string $key, string $label, string $type = 'text', array $more = []): Column
    {
        return Column::make($key, $label, $type)->with($more);
    }

    /** @param array<string, mixed> $record */
    protected function str(array $record, string $key): ?string
    {
        $v = $record[$key] ?? null;

        return $v === null || $v === '' ? null : (string) $v;
    }
}
