<?php

namespace App\Services\BulkImport;

use App\Models\Ecommerce\Category;
use App\Models\Books\Ledger;
use App\Models\UnitOfMeasure;

/** Lookups every entity needs (a unit by its code or name, an account by its name), remembered for the one import. */
class ImportContext
{
    private array $memo = [];

    public function __construct(public readonly ?int $userId = null)
    {
    }

    private function find(string $bucket, string $text, callable $query)
    {
        $key = mb_strtolower(trim($text));
        if (! array_key_exists($bucket.'|'.$key, $this->memo)) {
            $this->memo[$bucket.'|'.$key] = $query($key);
        }

        return $this->memo[$bucket.'|'.$key];
    }

    /** Forget what was looked up (after a record created something later records look for). */
    public function forget(string $bucket = ''): void
    {
        foreach (array_keys($this->memo) as $k) {
            if ($bucket === '' || str_starts_with($k, $bucket.'|')) {
                unset($this->memo[$k]);
            }
        }
    }

    public function unit(string $text): ?UnitOfMeasure
    {
        return $this->find('unit', $text, fn ($k) => UnitOfMeasure::whereRaw('LOWER(code) = ?', [$k])->orWhereRaw('LOWER(name) = ?', [$k])->first());
    }

    /** An account by its name or code. */
    public function ledger(string $text): ?Ledger
    {
        return $this->find('ledger', $text, fn ($k) => Ledger::whereRaw('LOWER(name) = ?', [$k])->orWhereRaw('LOWER(code) = ?', [$k])->first());
    }

    public function category(string $text): ?Category
    {
        return Category::whereRaw('LOWER(name) = ?', [mb_strtolower(trim($text))])->first();   // not remembered: an earlier row of the same file may have just made it
    }
}
