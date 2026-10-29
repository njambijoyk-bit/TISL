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
        $v->loadMissing(['type', 'items.taxes', 'creator', 'customer']);
        $stationId = $v->station_id ?? DB::table('vouchers')->where('id', $v->id)->value('station_id');
        $station = $stationId ? Station::find($stationId) : null;
        $b = $this->stations->branch((int) $v->location_id);
        $paper = $paper && in_array($paper, $b['paper_allowed'], true) ? $paper : ($station ? $this->stations->paperFor($station) : $b['paper_default']);
        $co = CompanyProfile::current();
        $lines = [];
        $groups = [];
        $round = 0.0;
        foreach ($v->items->whereNull('parent_item_id') as $it) {
            if ($it->notes === \App\Services\Books\VoucherService::ROUNDING_NOTE) {
                $round += (float) $it->amount;
                continue;
            }
            $lines[] = ['description' => $it->description.($it->variant_label ? " ({$it->variant_label})" : ''), 'quantity' => (float) $it->quantity, 'rate' => (float) $it->rate,
                'discount' => (float) $it->discount_amount, 'amount' => (float) $it->amount];
        }
        // what each tax rate was charged on, and the tax it came to (a 0% rate shows too)
        foreach ($v->items as $it) {
            if ($it->notes === \App\Services\Books\VoucherService::ROUNDING_NOTE) {
                continue;
            }
            foreach ($it->taxes as $t) {
                $g = $groups[$t->label] ?? ['label' => $t->label, 'base' => 0.0, 'amount' => 0.0];
                $g['base'] = round($g['base'] + (float) $t->base_amount, 2);
                $g['amount'] = round($g['amount'] + (float) $t->tax_amount, 2);
                $groups[$t->label] = $g;
            }
        }
        $taxes = array_map(fn ($g) => ['label' => $g['label'], 'amount' => $g['amount']], array_values($groups));
        $tenders = DB::table('voucher_tenders as t')->leftJoin('payment_methods as m', 'm.id', '=', 't.payment_method_id')->where('t.voucher_id', $v->id)->orderBy('t.id')
            ->get(['m.name', 't.amount', 't.reference'])->map(fn ($t) => ['method' => $t->name, 'amount' => (float) $t->amount, 'reference' => $t->reference])->all();
        $paid = $v->meta['pos_paid'] ?? null;

        return [
            'paper' => $paper, 'papers' => $b['paper_allowed'], 'copy' => $copy, 'prints' => $prints,
            'company' => $this->company($co),
            'branch' => DB::table('locations')->where('id', $v->location_id)->value('name'), 'station' => $station?->name, 'cashier' => $v->creator?->name ?? ($station?->kind === 'self_checkout' ? 'Self checkout' : null),
            'document' => $v->type?->name, 'number' => $v->voucher_number, 'at' => ($v->posted_at ?? $v->created_at)?->timezone((string) config('app.timezone', 'Africa/Nairobi'))->format('d/m/Y H:i'),
            'date' => ($v->posted_at ?? $v->created_at)?->timezone((string) config('app.timezone', 'Africa/Nairobi'))->format('d/m/Y'),
            'time' => ($v->posted_at ?? $v->created_at)?->timezone((string) config('app.timezone', 'Africa/Nairobi'))->format('H:i'),
            'customer' => $this->customerName($v),
            'customer_pin' => trim((string) ($v->party_tax_id ?: $v->customer?->tax_id)) ?: null,
            'narration' => $this->narration($v),
            'lines' => $lines, 'subtotal' => round((float) $v->subtotal - $round, 2), 'round_off' => round($round, 2), 'taxes' => $taxes, 'tax_groups' => array_values($groups), 'tax_total' => (float) $v->tax_total, 'total' => (float) $v->total_amount,
            'tenders' => $tenders, 'tendered' => $paid['tendered'] ?? null, 'change' => $paid['change'] ?? null,
            'qr' => CodeFactory::make('qr', (string) $v->voucher_number)->svg(),   // scanned at the return screen to find this receipt
        ];
    }

    /** The business as the top and bottom of the receipt show it, each part only when it is filled in. @return array<string, mixed> */
    private function company(CompanyProfile $co): array
    {
        $emails = $co->emailList();
        $place = array_values(array_filter([trim((string) $co->city), trim((string) $co->country)]));

        return [
            'name' => trim((string) $co->name) ?: (trim((string) $co->legal_name) ?: (trim((string) $co->short_code) ?: config('app.name'))),   // trading name, then legal name, then short code
            'description' => trim((string) $co->description) ?: null,
            'address' => array_values(array_filter(array_map('trim', preg_split('/\R/', (string) $co->address) ?: []))),
            'place' => implode(', ', $place),   // one of them alone has no comma
            'email' => $emails[0]['value'] ?? null, 'website' => trim((string) $co->website) ?: null, 'tax_pin' => trim((string) $co->tax_pin) ?: null,
            'tax_lines' => $co->taxLines(),   // the jurisdiction and registrations the company chose to print
            'declaration' => trim((string) $co->declaration) ?: null,
            'tagline' => trim((string) $co->tagline) ?: 'Thank you for your business. Keep this receipt: returns need it.',
            'logo' => $this->logo($co->logo_url),
        ];
    }

    /** The logo as a data address the printed page can carry, or null when there is none. */
    private function logo(?string $url): ?string
    {
        $path = $url ? ltrim((string) preg_replace('#^/?storage/#', '', $url), '/') : null;
        $disk = \Illuminate\Support\Facades\Storage::disk('public');
        if (! $path || ! str_starts_with($path, 'company/') || ! $disk->exists($path)) {
            return null;
        }
        $mime = ['png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'webp' => 'image/webp', 'gif' => 'image/gif'][strtolower(pathinfo($path, PATHINFO_EXTENSION))] ?? null;

        return $mime ? 'data:'.$mime.';base64,'.base64_encode($disk->get($path)) : null;
    }

    /** What the sale was noted as, unless it is only the till's own label. */
    private function narration(Voucher $v): ?string
    {
        $n = trim((string) $v->narration);

        return $n === '' || str_starts_with($n, 'Point of sale') ? null : $n;
    }

    /** Who it was sold to, when anyone was named: the name typed, else the customer's, else their ledger; never the walk-in. */
    private function customerName(Voucher $v): ?string
    {
        if (trim((string) $v->party_name) !== '') {
            return trim((string) $v->party_name);
        }
        if (! empty($v->meta['guest'])) {
            return null;
        }
        $name = $v->customer ? trim($v->customer->first_name.' '.$v->customer->last_name) : '';

        return $name !== '' ? $name : ($v->partyLedger?->name ?: null);
    }
}
