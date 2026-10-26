<?php

namespace App\Services\BulkImport\Entities;

use App\Models\Ecommerce\Category;
use App\Services\BulkImport\AbstractEntity;
use App\Services\BulkImport\ImportContext;
use App\Services\BulkImport\RowProblem;

/** E-commerce → Categories. Products need one, so a new shop starts here. A parent may be a category already there or one higher up in the same file. */
class CategoriesEntity extends AbstractEntity
{
    use TradingColumns;

    public function key(): string
    {
        return 'ecommerce.categories';
    }

    public function module(): string
    {
        return 'ecommerce';
    }

    public function label(): string
    {
        return 'Product categories';
    }

    public function description(): string
    {
        return 'The shelves products sit on. Import these before products.';
    }

    public function columns(): array
    {
        return [
            $this->required('name', 'Name', 'text', ['max' => 255, 'example' => 'Baking']),
            $this->optional('parent', 'Parent category', 'text', ['example' => 'Pantry', 'help' => 'A category already in the system, or one listed higher up in this file.']),
            $this->optional('description', 'Description', 'text'),
            $this->optional('is_active', 'Active', 'boolean', ['example' => 'yes', 'help' => 'Empty means yes.']),
        ];
    }

    public function examples(): array
    {
        return [
            ['name' => 'Pantry', 'parent' => '', 'description' => 'Dry goods', 'is_active' => 'yes'],
            ['name' => 'Baking', 'parent' => 'Pantry', 'description' => '', 'is_active' => 'yes'],
        ];
    }

    public function check(array $r, ImportContext $ctx): void
    {
        if (Category::whereRaw('LOWER(name) = ?', [mb_strtolower($r['name'])])->exists()) {
            throw new RowProblem("There is already a category called {$r['name']}.", RowProblem::EXISTS, 'name');
        }
        if ($this->str($r, 'parent') && ! $ctx->category($r['parent'])) {
            throw new RowProblem("The parent category \"{$r['parent']}\" is not in the system, nor above this row in the file.", RowProblem::MISSING_REF, 'parent');
        }
    }

    public function store(array $r, ImportContext $ctx): void
    {
        Category::create([
            'name' => $r['name'], 'slug' => $this->uniqueSlug(Category::class, $r['name']), 'description' => $r['description'] ?? null,
            'parent_id' => $this->str($r, 'parent') ? $ctx->category($r['parent'])->id : null, 'is_active' => $r['is_active'] ?? true,
        ]);
    }
}
