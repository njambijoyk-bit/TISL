<?php

namespace App\Services\Chat\Local;

use App\Services\Chat\Local\Resolvers as R;

/** The resolver registry: the name an entry's data-resolver gives, and the class that does the work. */
final class ResolverRegistry
{
    /** @return array<string,Resolver> */
    public static function all(): array
    {
        return [
            'catalogue.public' => new R\CataloguePublic,
            'orders.mine' => new R\OrdersMine,
            'payments.mine' => new R\PaymentsMine,
            'codes.mine' => new R\CodesMine,
            'orders.lookup' => new R\OrdersLookup,
            'customers.lookup' => new R\CustomersLookup,
            'payments.summary' => new R\PaymentsSummary,
        ];
    }
}
