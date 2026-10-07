<?php

namespace App\Services\Catalogue;

use App\Models\CustomerTypeDiscount;
use App\Models\User;
use App\Services\Books\BooksException;

/**
 * Who a price list, an archive or a brochure is for: staff only, everyone (guests too), signed-in customers, or chosen customer types.
 * The customer types are never listed in code: they are read from the customer_type_discounts table every time.
 */
class Audience
{
    public const ACCESS = ['staff', 'everyone', 'customers', 'types'];

    /** @return array<int,array{slug:string,name:string}> the customer types set up in the database (active ones) */
    public static function types(): array
    {
        try {
            return CustomerTypeDiscount::active()->get(['slug', 'name'])->map(fn ($t) => ['slug' => (string) $t->slug, 'name' => (string) $t->name])->all();
        } catch (\Throwable) {
            return [];
        }
    }

    /**
     * Check the dropdown choice and return [access, types]. Types are checked against the database; a list for chosen types must name at least one.
     * @throws BooksException
     */
    public static function clean(?string $access, $types): array
    {
        $access = in_array($access, self::ACCESS, true) ? $access : 'staff';
        if ($access !== 'types') {
            return [$access, null];
        }
        $known = array_column(self::types(), 'slug');
        $chosen = array_values(array_unique(array_filter(array_map('strval', is_array($types) ? $types : []), fn ($s) => in_array($s, $known, true))));
        if (! $chosen) {
            throw new BooksException('Choose at least one customer type.');
        }

        return ['types', $chosen];
    }

    public static function isStaff(?User $u): bool
    {
        return $u && $u->role !== 'customer';
    }

    /** May this viewer (null = a guest) see something set for this audience? Staff see everything. */
    public static function allows(?string $access, ?array $types, ?User $u): bool
    {
        if (self::isStaff($u)) {
            return true;
        }

        return match ($access) {
            'everyone' => true,
            'customers' => (bool) $u,
            'types' => $u && in_array((string) ($u->customer?->customer_type ?? ''), (array) $types, true),
            default => false,
        };
    }

    /** Narrow a query on a table with `access` and `customer_types` columns to what this viewer may see. */
    public static function scope($query, ?User $u)
    {
        if (self::isStaff($u)) {
            return $query;
        }
        $type = $u ? (string) ($u->customer?->customer_type ?? '') : null;

        return $query->where(function ($w) use ($u, $type) {
            $w->where('access', 'everyone');
            if ($u) {
                $w->orWhere('access', 'customers');
                if ($type !== '') {
                    $w->orWhere(fn ($x) => $x->where('access', 'types')->whereJsonContains('customer_types', $type));
                }
            }
        });
    }
}
