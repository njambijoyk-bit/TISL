<?php

namespace App\Services\Chat\Local\Resolvers;

use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Services\Chat\Local\CallerContext;
use App\Services\Chat\Local\Resolver;
use App\Services\Chat\Local\ResolverResult;
use Illuminate\Support\Facades\Log;

abstract class BaseResolver implements Resolver
{
    public function requires(): array
    {
        return [];
    }

    public function needs(): array
    {
        return [];
    }

    public function sensitive(): bool
    {
        return true;
    }

    /** A resolver that fails must not fail the chat: it answers "nothing found" and says why in the log. */
    protected function guarded(\Closure $fn): ResolverResult
    {
        try {
            return $fn();
        } catch (\Throwable $e) {
            Log::warning('Mimi resolver failed', ['resolver' => static::class, 'error' => $e->getMessage()]);

            return ResolverResult::empty();
        }
    }

    protected function money($n): string
    {
        return 'KSh ' . number_format((float) $n, 2);
    }

    /** Sales documents live in the books as vouchers. */
    protected function salesDocs()
    {
        return Voucher::query()->whereHas('type', fn ($q) => $q->whereIn('base_type', [VoucherType::SALES_ORDER, VoucherType::SALES, VoucherType::CASH_SALE]));
    }

    /** Narrow a voucher query to the order the person named (number, or a bare "order 42"). */
    protected function named($q, array $slots)
    {
        if (! empty($slots['ordref'])) {
            return $q->whereRaw('LOWER(voucher_number) = ?', [strtolower($slots['ordref'])]);
        }
        if (! empty($slots['ordnum'])) {
            return $q->where('id', (int) $slots['ordnum']);
        }

        return $q;
    }

    protected function orderLine(Voucher $o): string
    {
        return trim("{$o->voucher_number} · {$o->type?->name} · {$o->status}" . ($o->fulfilment_status ? " · {$o->fulfilment_status}" : '') . ' · ' . $this->money($o->base_total ?? $o->total_amount) . ' · ' . $o->date?->format('j M Y'), ' ·');
    }
}
