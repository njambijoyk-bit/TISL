<?php

namespace App\Services\Booking;

use App\Models\BookableResource;
use App\Models\Booking;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\Customer;
use App\Models\ResourceService;
use App\Models\Service;
use App\Models\ServiceSetting;
use App\Models\ServiceVariant;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Books\LedgerService;
use App\Services\Books\ServiceFeeService;
use App\Services\Books\VoucherService;
use App\Services\Calendar\AvailabilityService;
use App\Services\Calendar\CalendarService;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Booking a service. A booking takes a resource (the staff member, room… that does the service) for a stretch of time, and every
 * amount goes through the voucher engine:
 *   booked      a Sales Order records the service and the fees known up front; the deposit and booking fee are invoiced at once to the
 *               customer's account (the deposit is a liability, not income)
 *   done        a Sales invoice for the service, its materials, the completion fees and any extras; a held deposit moves to the customer's account
 *   cancelled   in time: nothing is charged, the held deposit goes back to the customer's account. Late (inside the window in Service settings):
 *               the cancellation fee is invoiced and the deposit is kept against it
 *   no show     as a late cancellation, with the no-show fee
 */
class BookingService
{
    /** A booking that starts before this hour, or ends after the other, is "after hours" for the after-hours fee. */
    public const OPENS = '08:00';
    public const CLOSES = '18:00';

    public function __construct(private VoucherService $vouchers, private ServiceFeeService $fees, private AvailabilityService $availability, private CalendarService $calendar, private LedgerService $ledgers) {}

    public static function ready(): bool
    {
        return Schema::hasTable('bookings');
    }

    // ── how long, who, how much ────────────────────────────────────────────

    /** Minutes a package takes (from its duration and unit), 60 when it has none. */
    public function minutes(ServiceVariant $v): int
    {
        $n = (float) $v->duration_value;
        if ($n <= 0) {
            return 60;
        }
        $u = strtolower((string) ($v->durationUnit?->code ?? $v->durationUnit?->name ?? ''));
        $per = match (true) {
            str_starts_with($u, 'min') => 1, str_starts_with($u, 'h') => 60, str_starts_with($u, 'd') => 1440, str_starts_with($u, 'w') => 10080, default => 1,
        };
        if ($per === 1 && ! str_starts_with($u, 'min')) {
            $per = 60;   // an unknown unit: read the number as hours
        }

        return max(5, (int) round($n * $per));
    }

    /** Active resources that can do this service (or this package), in a stable order. */
    public function resourcesFor(Service $s, ?int $variantId, ?int $locationId = null): \Illuminate\Support\Collection
    {
        $ids = ResourceService::where('service_id', $s->id)->where(fn ($q) => $q->whereNull('service_variant_id')->when($variantId, fn ($w) => $w->orWhere('service_variant_id', $variantId)))->pluck('resource_id');

        // a resource with no branch works anywhere, so it is offered at every branch
        return BookableResource::where('is_active', true)->whereIn('id', $ids)->when($locationId, fn ($q) => $q->where(fn ($w) => $w->whereNull('location_id')->orWhere('location_id', $locationId)))->orderBy('name')->get();
    }

    /** The branches this service (or package) is offered at — where someone who does it works. [{id, name}] */
    public function branchesFor(Service $s, ?int $variantId): array
    {
        $ids = $this->resourcesFor($s, $variantId)->pluck('location_id')->filter()->unique()->values();

        return $ids->isEmpty() ? [] : \Illuminate\Support\Facades\DB::table('locations')->whereIn('id', $ids)->orderBy('name')->get(['id', 'name'])->map(fn ($l) => ['id' => $l->id, 'name' => $l->name])->all();
    }

    public function bookable(Service $s): bool
    {
        return $s->canBeBooked() && ResourceService::where('service_id', $s->id)->exists();
    }

    /** Free start times on a day for a package: every resource that does it, each time once (with who is free then). */
    public function slots(Service $s, ServiceVariant $v, Carbon $day, ?int $resourceId = null, ?int $locationId = null): array
    {
        $len = $this->minutes($v);
        $out = [];
        foreach ($this->resourcesFor($s, $v->id, $locationId) as $r) {
            if ($resourceId && (int) $r->id !== $resourceId) {
                continue;
            }
            foreach ($this->availability->freeSlots($r, $day, $len) as $t) {
                $out[$t][] = ['id' => $r->id, 'name' => $r->name];
            }
        }
        ksort($out);

        return collect($out)->map(fn ($who, $t) => ['time' => $t, 'resources' => $who])->values()->all();
    }

    /** Pick the resource: the one asked for, else the first that is free. Null only when no resource is set up for the service (admin bookings). */
    private function pick(Service $s, ?int $variantId, Carbon $start, Carbon $end, ?int $resourceId, ?int $exceptBooking = null, ?int $locationId = null): ?BookableResource
    {
        if ($this->resourcesFor($s, $variantId)->isEmpty()) {
            return null;
        }
        $list = $this->resourcesFor($s, $variantId, $resourceId ? null : $locationId);
        if ($list->isEmpty()) {
            throw new BooksException('Nobody does this at that branch.');
        }
        if ($resourceId) {
            $r = $list->firstWhere('id', $resourceId) ?? throw new BooksException('That person or room does not do this service.');
            if ($why = $this->availability->problem($r, $start, $end, $exceptBooking)) {
                throw new BooksException($why);
            }

            return $r;
        }
        foreach ($list as $r) {
            if ($this->availability->problem($r, $start, $end, $exceptBooking) === null) {
                return $r;
            }
        }
        throw new BooksException('Nobody is free then. Pick another time.');
    }

    /** Does a fee's condition hold for this booking? */
    private function holds(array $fee, array $ctx): bool
    {
        $v = $fee['condition_value'] ?? null;

        return match ($fee['condition'] ?? 'always') {
            'onsite' => (bool) $ctx['on_site'],
            'urgent' => $ctx['hours_ahead'] <= (float) $v,
            'after_hours' => $ctx['after_hours'],
            'group' => $ctx['people'] >= (float) $v,
            default => true,
        };
    }

    /**
     * Every fee on for this service that applies to this booking, worked out: [{ledger_id, name, kind, timing, amount, not_income}].
     * Percentages are of the service price; a per-unit fee is per extra person (or, for overtime and the like, nothing until it happens).
     */
    public function feesFor(Service $s, float $price, array $ctx): array
    {
        $out = [];
        foreach ($this->fees->forService($s) as $f) {
            if (! $f['is_enabled'] || ! $this->holds($f, $ctx)) {
                continue;
            }
            $amount = match ($f['basis']) {
                'percent' => $price * (float) $f['amount'] / 100,
                'per_unit' => (float) $f['amount'] * ($f['kind'] === 'extra_person' ? max(0, $ctx['people'] - 1) : 0),
                default => (float) $f['amount'],
            };
            $amount = round($amount, 2);
            if ($amount > 0) {
                $out[] = ['ledger_id' => $f['ledger']['id'], 'name' => $f['ledger']['name'], 'kind' => $f['kind'], 'timing' => $f['timing'], 'amount' => $amount, 'not_income' => $f['not_income']];
            }
        }

        return $out;
    }


    /**
     * The service fees ticked for a package that a sales document or quotation should carry as lines of their own: charged with the service or when it is done,
     * with no condition to check (on-site, urgent, groups… are left to add by hand). Money held for the customer (deposits, tips) and fees for what might go wrong
     * are not income lines. Amounts are in the service's currency, or converted to $currencyId when given.
     *
     * @return array<int, array{ledger_id:int, name:string, amount:float}>
     */
    public function chargeLinesFor(Service $s, ?ServiceVariant $v, ?int $currencyId = null): array
    {
        $price = (float) ($v?->price ?? 0);
        $ctx = ['on_site' => false, 'people' => 1, 'hours_ahead' => 1.0e9, 'after_hours' => false];
        $from = $s->currency_id ? \App\Models\Currency::find($s->currency_id) : null;
        $to = $currencyId && (int) $currencyId !== (int) $s->currency_id ? \App\Models\Currency::find($currencyId) : null;

        return collect($this->feesFor($s, $price, $ctx))->filter(fn ($f) => ! $f['not_income'] && in_array($f['timing'], ['booking', 'completion'], true))
            ->map(fn ($f) => ['ledger_id' => $f['ledger_id'], 'name' => $f['name'], 'amount' => $from && $to ? round($from->convertTo($to, $f['amount']), 2) : $f['amount']])->values()->all();
    }

    private function context(array $in, Carbon $start, Carbon $end): array
    {
        return ['on_site' => (bool) ($in['on_site'] ?? false), 'people' => max(1, (int) ($in['people'] ?? 1)), 'hours_ahead' => max(0, now()->diffInMinutes($start, false) / 60),
            'after_hours' => $start->format('H:i') < self::OPENS || $end->format('H:i') > self::CLOSES];
    }

    private function line(array $fee): array
    {
        return ['type' => 'custom', 'description' => $fee['name'], 'quantity' => 1, 'rate' => $fee['amount'], 'ledger_id' => $fee['ledger_id']];
    }

    private function serviceLine(ServiceVariant $v, float $price): array
    {
        return ['type' => 'service', 'service_variant_id' => $v->id, 'quantity' => 1, 'rate' => $price];
    }

    /** What a customer would be told before booking: the price, each fee by when it falls due, and the deposit. No records are made. */
    public function quote(array $in): array
    {
        [$s, $v, $start, $end] = $this->parse($in);
        $price = (float) ($v->price ?? 0);
        $fees = $this->feesFor($s, $price, $this->context($in, $start, $end));

        return ['service' => $s->name, 'package' => $v->name, 'starts_at' => $start->toIso8601String(), 'ends_at' => $end->toIso8601String(), 'minutes' => $this->minutes($v), 'price' => $price,
            'fees' => $fees, 'deposit' => round((float) collect($fees)->where('kind', 'deposit')->sum('amount'), 2),
            'due_at_booking' => round((float) collect($fees)->where('timing', 'booking')->sum('amount'), 2), 'currency_id' => $s->currency_id];
    }

    private function parse(array $in): array
    {
        $s = Service::find($in['service_id'] ?? null) ?? throw new BooksException('Choose a service.');
        $v = ServiceVariant::with('durationUnit')->where('service_id', $s->id)->find($in['service_variant_id'] ?? null) ?? throw new BooksException('Choose a package.');
        if (empty($in['starts_at'])) {
            throw new BooksException('Choose a day and time.');
        }
        $start = Carbon::parse($in['starts_at'])->seconds(0);

        return [$s, $v, $start, $start->copy()->addMinutes($this->minutes($v))];
    }

    // ── make, move, cancel, finish ─────────────────────────────────────────

    /**
     * Book. $in: service_id, service_variant_id, starts_at, customer_id, resource_id?, people?, on_site?, address?, notes?, source?
     *
     * @throws BooksException
     */
    public function create(array $in, ?User $by = null): Booking
    {
        if (! self::ready()) {
            throw new BooksException('Run script 61_bookings.sql before taking bookings.');
        }
        [$s, $v, $start, $end] = $this->parse($in);
        $customer = Customer::find($in['customer_id'] ?? null) ?? throw new BooksException('Choose the customer.');
        if (! $this->bookable($s) && ($in['source'] ?? 'admin') === 'portal') {
            throw new BooksException('This service cannot be booked online.');
        }
        if ($start->lte(now()) && ($in['source'] ?? 'admin') === 'portal') {
            throw new BooksException('Choose a time that has not passed.');
        }
        $price = round((float) ($in['price'] ?? $v->price ?? 0), 2);
        $fees = $this->feesFor($s, $price, $this->context($in, $start, $end));

        return DB::transaction(function () use ($in, $s, $v, $start, $end, $customer, $price, $fees, $by) {
            $resource = $this->pick($s, $v->id, $start, $end, isset($in['resource_id']) ? (int) $in['resource_id'] : null, null, ! empty($in['on_site']) || empty($in['location_id']) ? null : (int) $in['location_id']);   // a visit to the customer's place ignores the branch
            if ($resource) {
                BookableResource::whereKey($resource->id)->lockForUpdate()->first();   // two people choosing the same slot are taken one after the other
                if ($why = $this->availability->problem($resource, $start, $end)) {
                    throw new BooksException($why);
                }
            }
            $deposit = collect($fees)->firstWhere('kind', 'deposit');
            $b = Booking::create(['bookable_type' => 'service', 'bookable_id' => $s->id, 'service_variant_id' => $v->id, 'customer_id' => $customer->id, 'resource_id' => $resource?->id,
                'location_id' => $resource?->location_id ?? ($in['location_id'] ?? null), 'starts_at' => $start, 'ends_at' => $end, 'people' => max(1, (int) ($in['people'] ?? 1)), 'on_site' => (bool) ($in['on_site'] ?? false),
                'address' => $in['address'] ?? null, 'notes' => $in['notes'] ?? null, 'status' => 'confirmed', 'source' => $in['source'] ?? 'admin', 'currency_id' => $s->currency_id, 'price' => $price,
                'fees' => $fees, 'deposit_amount' => $deposit['amount'] ?? 0, 'deposit_ledger_id' => $deposit['ledger_id'] ?? null, 'deposit_status' => $deposit ? 'held' : 'none', 'created_by' => $by?->id]);
            $b->update(['number' => 'BK-' . str_pad((string) $b->id, 6, '0', STR_PAD_LEFT)]);

            $orderLines = array_merge([$this->serviceLine($v, $price)], array_map(fn ($f) => $this->line($f), array_filter($fees, fn ($f) => $f['timing'] !== 'booking' && ! $f['not_income'])));
            $meta = ['booking_id' => $b->id];
            $order = $this->vouchers->placeOrder(['date' => today()->toDateString(), 'customer_id' => $customer->id, 'currency_id' => $s->currency_id, 'location_id' => $b->location_id,
                'narration' => "{$b->number} — {$s->name}, {$start->format('d M Y H:i')}", 'meta' => $meta, 'lines' => $orderLines, 'channel' => $b->source === 'portal' ? 'storefront' : 'admin'], $by);
            $b->order_voucher_id = $order->id;

            $upfront = array_map(fn ($f) => $this->line($f), array_filter($fees, fn ($f) => $f['timing'] === 'booking'));
            if ($upfront) {
                $inv = $this->vouchers->create(['voucher_type_id' => (VoucherType::byBase(VoucherType::SALES) ?? throw new BooksException('The Sales voucher type is switched off.'))->id, 'date' => today()->toDateString(),
                    'due_date' => today()->toDateString(), 'customer_id' => $customer->id, 'currency_id' => $s->currency_id, 'location_id' => $b->location_id, 'reference_no' => $b->number,
                    'narration' => "{$b->number} — deposit and booking fee", 'meta' => $meta + ['booking_upfront' => true], 'lines' => array_values($upfront), 'moves_stock' => false], $by);
                $b->upfront_voucher_id = $inv->id;
            }
            $b->save();
            $this->putOnCalendar($b);

            return $b->fresh();
        });
    }

    private function putOnCalendar(Booking $b): void
    {
        if (! $b->resource_id) {
            return;
        }
        $r = BookableResource::find($b->resource_id);
        $c = Customer::find($b->customer_id);
        $name = trim(($c?->first_name ?? '') . ' ' . ($c?->last_name ?? ''));
        $this->calendar->put(['source_type' => 'booking', 'source_id' => $b->id, 'user_id' => $r?->user_id, 'resource_id' => $b->resource_id, 'kind' => 'booking',
            'title' => trim(($b->service?->name ?? 'Booking') . ($name !== '' ? " — {$name}" : '')), 'starts_at' => $b->starts_at, 'ends_at' => $b->ends_at, 'all_day' => false, 'location_id' => $b->location_id,
            'customer_id' => $b->customer_id, 'status' => $b->status, 'visibility' => 'team', 'url' => '/admin/bookings?id=' . $b->id]);
    }

    private function assertOpen(Booking $b): void
    {
        if ($b->status !== 'confirmed') {
            throw new BooksException("{$b->number} is {$b->status} — it can't be changed.");
        }
    }

    /** Is a change at this moment late (inside the window of the start)? */
    public function isLate(Booking $b, string $window = 'cancellation_window_hours'): bool
    {
        return now()->diffInMinutes($b->starts_at, false) < ServiceSetting::current()->{$window} * 60;
    }

    /** A fee of this kind for this booking (the service's own amount), as a voucher line, or null when the service does not charge it. */
    private function eventFee(Booking $b, string $timing): ?array
    {
        $s = $b->service;
        if (! $s) {
            return null;
        }
        $hit = collect($this->feesFor($s, (float) $b->price, ['on_site' => $b->on_site, 'people' => $b->people, 'hours_ahead' => 0, 'after_hours' => false]))->firstWhere('timing', $timing);

        return $hit;
    }

    /** Move a booking. A late move (inside the reschedule window) is charged the reschedule fee, if the service has one. */
    public function reschedule(Booking $b, string $startsAt, ?int $resourceId, ?User $by = null): Booking
    {
        $this->assertOpen($b);
        $s = $b->service;
        $v = ServiceVariant::with('durationUnit')->find($b->service_variant_id);
        $start = Carbon::parse($startsAt)->seconds(0);
        $end = $start->copy()->addMinutes($v ? $this->minutes($v) : (int) $b->starts_at->diffInMinutes($b->ends_at));

        return DB::transaction(function () use ($b, $s, $start, $end, $resourceId, $by) {
            $late = $this->isLate($b, 'reschedule_window_hours');
            $r = $this->pick($s, $b->service_variant_id, $start, $end, $resourceId ?: $b->resource_id, $b->id);
            $fee = $late ? $this->eventFee($b, 'reschedule') : null;
            $b->fill(['starts_at' => $start, 'ends_at' => $end, 'resource_id' => $r?->id ?? $b->resource_id, 'location_id' => $r?->location_id ?? $b->location_id, 'moved_count' => $b->moved_count + 1]);
            if ($fee) {
                $b->fee_voucher_id = $this->feeInvoice($b, [$fee], 'late move', $by)->id;
            }
            $b->save();
            $this->calendar->remove('booking', $b->id);
            $this->putOnCalendar($b);

            return $b->fresh();
        });
    }

    /** An invoice for fees charged because of what happened to the booking (late cancellation, no-show, late move). */
    private function feeInvoice(Booking $b, array $fees, string $why, ?User $by): Voucher
    {
        return $this->vouchers->create(['voucher_type_id' => (VoucherType::byBase(VoucherType::SALES) ?? throw new BooksException('The Sales voucher type is switched off.'))->id, 'date' => today()->toDateString(),
            'due_date' => today()->toDateString(), 'customer_id' => $b->customer_id, 'currency_id' => $b->currency_id, 'location_id' => $b->location_id, 'reference_no' => $b->number,
            'narration' => "{$b->number} — {$why}", 'meta' => ['booking_id' => $b->id, 'booking_fee' => $why], 'lines' => array_map(fn ($f) => $this->line($f), $fees), 'moves_stock' => false], $by);
    }

    /** What has been paid on the deposit invoice. */
    public function paidOnUpfront(Booking $b): float
    {
        $inv = $b->upfront_voucher_id ? Voucher::find($b->upfront_voucher_id) : null;
        if (! $inv || $inv->status !== Voucher::POSTED) {
            return 0.0;
        }

        return round((float) $inv->total_amount - $this->vouchers->outstanding($inv), 2);
    }

    /**
     * Give the held deposit to the customer's account (Dr the deposit liability, Cr the customer) — to be refunded or set against what they owe.
     * Built once for bookings and usable by anything that holds a deposit.
     */
    public function releaseDeposit(Booking $b, string $why, ?User $by): ?Voucher
    {
        if ($b->deposit_status !== 'held' || (float) $b->deposit_amount <= 0 || ! $b->deposit_ledger_id || $this->paidOnUpfront($b) + 0.005 < (float) $b->deposit_amount) {
            return null;   // nothing held, or the customer never paid it
        }
        $journal = VoucherType::byBase(VoucherType::JOURNAL) ?? throw new BooksException('The Journal voucher type is switched off.');
        $v = $this->vouchers->create(['voucher_type_id' => $journal->id, 'date' => today()->toDateString(), 'currency_id' => $b->currency_id, 'narration' => "{$b->number} deposit — {$why}",
            'meta' => ['booking_id' => $b->id], 'entries' => [
                ['ledger_id' => $b->deposit_ledger_id, 'side' => 'D', 'amount' => (float) $b->deposit_amount],
                ['ledger_id' => $this->ledgers->customerLedger($b->customer)->id, 'side' => 'C', 'amount' => (float) $b->deposit_amount],
            ]], $by);
        $b->update(['deposit_status' => 'released', 'deposit_release_voucher_id' => $v->id]);

        return $v;
    }

    /** Take back what was invoiced at booking when nothing of it has been paid, so the customer owes nothing for a booking that did not happen. */
    private function voidUnpaidUpfront(Booking $b, ?User $by): void
    {
        $inv = $b->upfront_voucher_id ? Voucher::find($b->upfront_voucher_id) : null;
        if ($inv && $inv->status === Voucher::POSTED && $this->paidOnUpfront($b) <= 0.005) {
            $this->vouchers->cancel($inv, "Booking {$b->number} did not go ahead", $by);
            $b->update(['deposit_status' => 'none']);
        }
    }

    private function closeOrder(Booking $b, string $reason, ?User $by): void
    {
        $o = $b->order_voucher_id ? Voucher::find($b->order_voucher_id) : null;
        if ($o && $o->status === Voucher::POSTED) {
            $this->vouchers->cancel($o, $reason, $by);
        }
    }

    /**
     * Cancel. In time: nothing charged, the deposit is given back to the customer's account. Late: the cancellation fee is invoiced and the
     * deposit is kept against it (what is left of it goes back to the customer's account at once).
     *
     * @return array{booking: Booking, late: bool, message: string}
     */
    public function cancel(Booking $b, ?string $reason, ?User $by = null, bool $asNoShow = false): array
    {
        $this->assertOpen($b);

        return DB::transaction(function () use ($b, $reason, $by, $asNoShow) {
            $late = $asNoShow || $this->isLate($b);
            $fee = $late ? $this->eventFee($b, $asNoShow ? 'no_show' : 'late_cancel') : null;
            $this->closeOrder($b, $reason ?: 'Booking cancelled', $by);
            $this->voidUnpaidUpfront($b, $by);
            $note = [];
            if ($fee) {
                $b->fee_voucher_id = $this->feeInvoice($b, [$fee], $asNoShow ? 'no-show fee' : 'late cancellation fee', $by)->id;
                $note[] = ($asNoShow ? 'No-show' : 'Late cancellation') . " fee of {$fee['amount']} invoiced.";
            }
            if ($b->deposit_status === 'held') {
                $paid = $this->paidOnUpfront($b);
                if ($paid + 0.005 >= (float) $b->deposit_amount && (float) $b->deposit_amount > 0) {
                    $this->releaseDeposit($b, $fee ? 'kept against the fee' : 'cancelled in time', $by);
                    $note[] = $fee ? 'The deposit is on the customer\'s account — set it against the fee, or refund the rest.' : 'The deposit is on the customer\'s account to refund.';
                } else {
                    $note[] = 'The deposit was not fully paid, so nothing is held.';
                }
            }
            $b->fill(['status' => $asNoShow ? 'no_show' : 'cancelled', 'cancelled_at' => now(), 'cancel_reason' => $reason, 'cancelled_late' => $late])->save();
            $this->putOnCalendar($b);   // stays on the calendar, marked cancelled / no-show (it no longer holds the time: availability ignores those)

            return ['booking' => $b->fresh(), 'late' => $late, 'message' => trim(($asNoShow ? 'Marked as a no-show. ' : 'Booking cancelled. ') . implode(' ', $note))];
        });
    }

    public function noShow(Booking $b, ?User $by = null): array
    {
        return $this->cancel($b, 'Did not come', $by, true);
    }

    /** The lines of the invoice raised when the service is done (also used for the preview). */
    public function invoiceLines(Booking $b, array $extra = []): array
    {
        $v = ServiceVariant::with('materials')->find($b->service_variant_id) ?? throw new BooksException('The package of this booking no longer exists.');
        $service = $this->serviceLine($v, (float) $b->price);
        $mats = $v->materials->map(fn ($m) => ['variant_id' => $m->variant_id, 'quantity' => (float) $m->quantity, 'mode' => $m->mode])->values()->all();
        if ($mats) {
            $service['materials'] = $mats;
        }
        $lines = [$service];
        foreach ($b->fees ?? [] as $f) {
            if ($f['timing'] === 'completion' && ! $f['not_income']) {
                $lines[] = $this->line($f);
            }
        }
        foreach ($extra as $x) {
            if ((float) ($x['amount'] ?? 0) <= 0) {
                continue;
            }
            $desc = trim((string) ($x['description'] ?? '')) ?: 'Extra';
            if (empty($x['ledger_id'])) {
                throw new BooksException("Choose the account for \"{$desc}\".");
            }
            $lines[] = ['type' => 'custom', 'description' => $desc, 'quantity' => 1, 'rate' => (float) $x['amount'], 'ledger_id' => (int) $x['ledger_id']];
        }

        return $lines;
    }

    /** The service is done: invoice it. $extra: [{description, amount, ledger_id}] for overtime, tips payable and the like. */
    public function complete(Booking $b, array $extra = [], ?User $by = null, bool $preview = false)
    {
        $this->assertOpen($b);
        $data = ['voucher_type_id' => (VoucherType::byBase(VoucherType::SALES) ?? throw new BooksException('The Sales voucher type is switched off.'))->id, 'date' => today()->toDateString(), 'due_date' => today()->toDateString(),
            'customer_id' => $b->customer_id, 'currency_id' => $b->currency_id, 'location_id' => $b->location_id, 'reference_no' => $b->number, 'narration' => "{$b->number} — {$b->service?->name}",
            'meta' => ['booking_id' => $b->id], 'lines' => $this->invoiceLines($b, $extra), 'moves_stock' => true, 'discount_choices' => []];
        if ($preview) {
            return $this->vouchers->preview($data, $by);
        }

        return DB::transaction(function () use ($b, $data, $by) {
            $inv = $this->vouchers->create($data, $by);
            $released = $this->releaseDeposit($b, 'service done', $by);
            $this->closeOrder($b, "Invoiced as {$inv->voucher_number}", $by);
            $b->fill(['status' => 'completed', 'completed_at' => now(), 'invoice_voucher_id' => $inv->id])->save();
            $this->calendar->put(['source_type' => 'booking', 'source_id' => $b->id, 'user_id' => $b->resource?->user_id, 'resource_id' => $b->resource_id, 'kind' => 'booking',
                'title' => $b->service?->name ?? 'Booking', 'starts_at' => $b->starts_at, 'ends_at' => $b->ends_at, 'status' => 'completed', 'visibility' => 'team']);

            return ['invoice' => $inv, 'deposit_released' => (bool) $released];
        });
    }
}
