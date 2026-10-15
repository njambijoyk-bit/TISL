<?php

namespace App\Services\Pos;

use App\Models\Access\AccessLog;
use App\Models\Books\Voucher;
use App\Models\CompanyProfile;
use App\Models\Pos\Station;
use App\Models\User;
use App\Services\Access\Authorizer;
use App\Services\Books\BooksException;
use App\Services\Codes\CodeFactory;
use Illuminate\Support\Facades\DB;

/**
 * What a till receipt says. The browser lays it out for the paper chosen (A4, 110, 85, 80 or 58 mm) and prints two copies of a sale: customer and store. The first print of a sale, by the person who made it,
 * is the original; every print after that is marked COPY, needs pos.reprint, and is written to the access log.
 */
class ReceiptService
{
    public function __construct(private StationService $stations)
    {
    }

    /** @return array<string, mixed> */
    public function build(User $u, int $voucherId, ?string $paper = null): array
    {
        $v = Voucher::with(['type', 'items.taxes', 'creator'])->findOrFail($voucherId);
        $access = app(Authorizer::class);
        $scope = $access->locationIds($u);
        if (($scope !== null && ! in_array((int) $v->location_id, $scope, true)) || ! ($v->channel === 'pos' || $v->station_id)) {
            throw new BooksException('That is not a point of sale document at your branch.');
        }
        $stationId = $v->station_id ?? DB::table('vouchers')->where('id', $v->id)->value('station_id');
        $station = $stationId ? Station::find($stationId) : null;
        $prints = (int) ($v->meta['pos_prints'] ?? 0);
        $own = (int) $v->created_by === (int) $u->id;
        $copy = ! ($own && $prints === 0);
        if ($copy && ! $access->allows($u, 'pos.reprint')) {
            throw new BooksException('This receipt has been printed already. You may not print copies: ask a supervisor.');
        }
        $v->update(['meta' => array_merge($v->meta ?? [], ['pos_prints' => $prints + 1])]);
        if ($copy) {
            AccessLog::record($u->id, null, 'pos_reprint', ['voucher' => $v->voucher_number, 'times' => $prints + 1]);
        }

        return $this->data($v, $paper, $copy, $prints + 1);
    }

    /** The receipt itself, for a document already checked. $prints is which print this is. @return array<string, mixed> */
    public function data(Voucher $v, ?string $paper, bool $copy, int $prints): array
    {
        $v->loadMissing(['type', 'items.taxes', 'creator']);
        $stationId = $v->station_id ?? DB::table('vouchers')->where('id', $v->id)->value('station_id');
        $station = $stationId ? Station::find($stationId) : null;
        $b = $this->stations->branch((int) $v->location_id);
        $paper = $paper && in_array($paper, $b['paper_allowed'], true) ? $paper : ($station ? $this->stations->paperFor($station) : $b['paper_default']);
        $co = CompanyProfile::current();
        $phones = $co->phoneList();
        $taxes = [];
        $lines = [];
        foreach ($v->items->whereNull('parent_item_id') as $it) {
            if ($it->notes === \App\Services\Books\VoucherService::ROUNDING_NOTE) {
                continue;
            }
            $lines[] = ['description' => $it->description.($it->variant_label ? " ({$it->variant_label})" : ''), 'quantity' => (float) $it->quantity, 'rate' => (float) $it->rate,
                'discount' => (float) $it->discount_amount, 'amount' => (float) $it->amount];
            foreach ($it->taxes as $t) {
                $taxes[$t->label] = round(($taxes[$t->label] ?? 0) + (float) $t->tax_amount, 2);
            }
        }
        $tenders = DB::table('voucher_tenders as t')->leftJoin('payment_methods as m', 'm.id', '=', 't.payment_method_id')->where('t.voucher_id', $v->id)->orderBy('t.id')
            ->get(['m.name', 't.amount', 't.reference'])->map(fn ($t) => ['method' => $t->name, 'amount' => (float) $t->amount, 'reference' => $t->reference])->all();
        $paid = $v->meta['pos_paid'] ?? null;

        return [
            'paper' => $paper, 'papers' => $b['paper_allowed'], 'copy' => $copy, 'prints' => $prints,
            'company' => ['name' => $co->name ?: config('app.name'), 'address' => trim(implode(', ', array_filter([$co->address, $co->city]))), 'phone' => $phones[0]['value'] ?? ($co->phone ?? null), 'tax_pin' => $co->tax_pin],
            'branch' => DB::table('locations')->where('id', $v->location_id)->value('name'), 'station' => $station?->name, 'cashier' => $v->creator?->name ?? ($station?->kind === 'self_checkout' ? 'Self checkout' : null),
            'document' => $v->type?->name, 'number' => $v->voucher_number, 'at' => ($v->posted_at ?? $v->created_at)?->timezone((string) config('app.timezone', 'Africa/Nairobi'))->format('d/m/Y H:i'),
            'customer' => ! empty($v->meta['guest']) ? null : ($v->party_name ?: $v->partyLedger?->name),
            'lines' => $lines, 'subtotal' => (float) $v->subtotal, 'taxes' => array_map(fn ($l, $a) => ['label' => $l, 'amount' => $a], array_keys($taxes), array_values($taxes)), 'tax_total' => (float) $v->tax_total, 'total' => (float) $v->total_amount,
            'tenders' => $tenders, 'tendered' => $paid['tendered'] ?? null, 'change' => $paid['change'] ?? null,
            'qr' => CodeFactory::make('qr', (string) $v->voucher_number)->svg(),   // scanned at the return screen to find this receipt
        ];
    }
}
