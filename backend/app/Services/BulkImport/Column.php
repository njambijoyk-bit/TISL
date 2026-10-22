<?php

namespace App\Services\BulkImport;

/**
 * One column of an import template: what the file calls it, what it holds, and whether it may be left empty.
 * Types: text, number, integer, boolean, date, list (several values in one cell, split on ; or |), enum (one of `options`).
 */
final class Column
{
    public const TYPES = ['text', 'number', 'integer', 'boolean', 'date', 'list', 'enum'];

    /** @param string[] $options allowed values for an enum; @param string[] $aliases other headings that mean the same column */
    public function __construct(
        public readonly string $key,
        public readonly string $label,
        public readonly string $type = 'text',
        public readonly bool $required = false,
        public readonly string $help = '',
        public readonly string $example = '',
        public readonly array $options = [],
        public readonly array $aliases = [],
        public readonly int $max = 0,
        public readonly bool $perRow = false,
    ) {
    }

    public static function make(string $key, string $label, string $type = 'text'): self
    {
        return new self($key, $label, $type);
    }

    public function with(array $changes): self
    {
        return new self(...array_merge(get_object_vars($this), $changes));
    }

    /** required, example, help, options, aliases, max and perRow are set through this, e.g. Column::make('name', 'Name')->with(['required' => true]) */
    public function toArray(): array
    {
        return [
            'key' => $this->key, 'label' => $this->label, 'type' => $this->type, 'required' => $this->required, 'help' => $this->help,
            'example' => $this->example, 'options' => $this->options, 'aliases' => $this->aliases, 'max' => $this->max, 'per_row' => $this->perRow,
        ];
    }

    /** The heading as the file may write it: case, spaces, dashes and underscores do not matter. */
    public static function norm(string $heading): string
    {
        $h = mb_strtolower(trim(preg_replace('/^\xEF\xBB\xBF/', '', $heading)));

        return preg_replace('/[\s_\-.]+/', '', $h);
    }
}
