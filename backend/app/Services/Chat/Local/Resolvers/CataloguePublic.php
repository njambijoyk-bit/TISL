<?php

namespace App\Services\Chat\Local\Resolvers;

use App\Models\Product;
use App\Models\Service;
use App\Services\Chat\Local\CallerContext;
use App\Services\Chat\Local\ResolverResult;

/** Public store information: what anyone browsing could see anyway. */
final class CataloguePublic extends BaseResolver
{
    public function kinds(): array
    {
        return ['any'];
    }

    public function sensitive(): bool
    {
        return false;
    }

    public function run(CallerContext $c, array $slots): ResolverResult
    {
        return $this->guarded(function () {
            $p = Product::query()->where('is_visible', true)->where('status', 'active')->select('name', 'price', 'in_stock')->limit(6)->get()
                ->map(fn ($x) => "{$x->name} · " . $this->money($x->price) . ' · ' . ($x->in_stock ? 'In stock' : 'Out of stock'));
            $s = Service::query()->where('is_available', true)->where('is_visible', true)->where('status', 'active')->select('name', 'base_price')->limit(4)->get()
                ->map(fn ($x) => "{$x->name} · from " . $this->money($x->base_price ?? 0));
            $lines = $p->concat($s)->all();

            return $lines ? ResolverResult::ok($lines) : ResolverResult::empty();
        });
    }
}
