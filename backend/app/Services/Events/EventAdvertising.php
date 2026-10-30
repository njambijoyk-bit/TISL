<?php

namespace App\Services\Events;

use App\Models\Books\VoucherType;
use App\Models\Customer;
use App\Models\Events\Event;
use App\Models\User;
use App\Services\Books\VoucherService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

/**
 * Promotion of events. Publishing is free (the directory); promotion is paid exposure sold as products the company prices (featured, homepage banner, category, search, newsletter) for a number of
 * days with a limit of how many may run together. TISL approves each campaign, invoices it in Books, and the advertiser sees what it earned: views, clicks and registrations.
 */
final class EventAdvertising
{
    public const KINDS = ['featured' => 'Featured event', 'banner' => 'Homepage banner', 'category' => 'Category promotion', 'search' => 'Sponsored search', 'newsletter' => 'Newsletter'];

    public function __construct(private VoucherService $vouchers, private EventEditor $editor)
    {
    }

    public static function ready(): bool
    {
        return Schema::hasTable('event_ad_products') && Schema::hasTable('event_ad_campaigns');
    }

    // ── products ─────────────────────────────────────────────────────────

    public function products(bool $all = false): array
    {
        return DB::table('event_ad_products')->when(! $all, fn ($q) => $q->where('is_active', 1))->orderBy('price')->get()->map(fn ($p) => (array) $p + ['kind_name' => self::KINDS[$p->kind] ?? $p->kind, 'is_active' => (bool) $p->is_active,
            'running' => $this->running((int) $p->id)])->all();
    }

    private function running(int $productId, ?string $from = null, ?string $to = null): int
    {
        $from ??= today()->toDateString();

        return DB::table('event_ad_campaigns')->where('product_id', $productId)->where('status', 'approved')->where('ends_on', '>=', $from)->when($to, fn ($q) => $q->where('starts_on', '<=', $to))->count();
    }

    public function saveProduct(array $in, ?int $id): array
    {
        $name = trim((string) ($in['name'] ?? ''));
        if ($name === '') {
            throw ValidationException::withMessages(['name' => 'Give the product a name.']);
        }
        if (! array_key_exists($in['kind'] ?? '', self::KINDS)) {
            throw ValidationException::withMessages(['kind' => 'Choose what kind of exposure it is.']);
        }
        if ((float) ($in['price'] ?? 0) < 0 || (int) ($in['duration_days'] ?? 7) < 1 || (int) ($in['max_slots'] ?? 5) < 1) {
            throw ValidationException::withMessages(['price' => 'Price, days and slots must be positive.']);
        }
        $row = ['name' => mb_substr($name, 0, 120), 'kind' => $in['kind'], 'description' => $in['description'] ?? null, 'price' => (float) ($in['price'] ?? 0), 'duration_days' => (int) ($in['duration_days'] ?? 7),
            'max_slots' => (int) ($in['max_slots'] ?? 5), 'is_active' => (bool) ($in['is_active'] ?? true), 'updated_at' => now()];
        $id ? DB::table('event_ad_products')->where('id', $id)->update($row) : $id = DB::table('event_ad_products')->insertGetId($row + ['created_at' => now()]);

        return collect($this->products(true))->firstWhere('id', $id);
    }

    public function deleteProduct(int $id): void
    {
        if (DB::table('event_ad_campaigns')->where('product_id', $id)->exists()) {
            DB::table('event_ad_products')->where('id', $id)->update(['is_active' => 0]);

            return;
        }
        DB::table('event_ad_products')->where('id', $id)->delete();
    }

    public function addStandardProducts(): int
    {
        $n = 0;
        foreach ([['Featured event, 7 days', 'featured', 3000, 7, 6], ['Homepage banner, 7 days', 'banner', 8000, 7, 3], ['Category spotlight, 14 days', 'category', 2500, 14, 4], ['Sponsored search, 14 days', 'search', 2000, 14, 5], ['Newsletter mention', 'newsletter', 1500, 7, 10]] as [$name, $kind, $price, $days, $slots]) {
            if (! DB::table('event_ad_products')->where('name', $name)->exists()) {
                $this->saveProduct(compact('name', 'kind', 'price') + ['duration_days' => $days, 'max_slots' => $slots], null);
                $n++;
            }
        }

        return $n;
    }

    // ── campaigns ────────────────────────────────────────────────────────

    public function request(Event $e, int $productId, string $start, ?int $categoryId, ?User $by): array
    {
        $p = DB::table('event_ad_products')->where('id', $productId)->where('is_active', 1)->first() ?? throw new EventException('That promotion is not on offer.');
        if ($e->status !== Event::PUBLISHED || $e->approval_status !== 'approved') {
            throw new EventException('Only an event that is on sale can be promoted. Publish it first.');
        }
        if ($start < today()->toDateString()) {
            throw new EventException('The promotion cannot start in the past.');
        }
        $end = \Illuminate\Support\Carbon::parse($start)->addDays($p->duration_days - 1)->toDateString();
        if ($p->kind === 'category' && ! $categoryId && ! $e->category_id) {
            throw new EventException('Choose the category to promote in.');
        }
        if ($this->running((int) $p->id, $start, $end) >= $p->max_slots) {
            throw new EventException('All the places for that promotion are taken for those dates. Choose other dates.');
        }
        if (DB::table('event_ad_campaigns')->where(['event_id' => $e->id, 'product_id' => $p->id])->whereIn('status', ['pending', 'approved'])->where('ends_on', '>=', $start)->where('starts_on', '<=', $end)->exists()) {
            throw new EventException('This event already has that promotion for those dates.');
        }
        $id = DB::table('event_ad_campaigns')->insertGetId(['event_id' => $e->id, 'product_id' => $p->id, 'category_id' => $p->kind === 'category' ? ($categoryId ?: $e->category_id) : null, 'requested_by' => $by?->id,
            'starts_on' => $start, 'ends_on' => $end, 'amount' => $p->price, 'status' => 'pending', 'created_at' => now(), 'updated_at' => now()]);

        return $this->shape(DB::table('event_ad_campaigns')->find($id));
    }

    public function shape(object $c): array
    {
        $p = DB::table('event_ad_products')->find($c->product_id);
        $e = Event::withTrashed()->find($c->event_id);
        $ctr = $c->impressions > 0 ? round($c->clicks / $c->impressions * 100, 2) : 0.0;

        return ['id' => (int) $c->id, 'event_id' => (int) $c->event_id, 'event' => $e?->title, 'product' => $p?->name, 'kind' => $p?->kind, 'starts_on' => $c->starts_on, 'ends_on' => $c->ends_on, 'amount' => (float) $c->amount, 'status' => $c->status,
            'live' => $c->status === 'approved' && $c->starts_on <= today()->toDateString() && $c->ends_on >= today()->toDateString(), 'note' => $c->note, 'invoice_id' => $c->invoice_id ? (int) $c->invoice_id : null,
            'impressions' => (int) $c->impressions, 'clicks' => (int) $c->clicks, 'registrations' => (int) $c->registrations, 'ctr' => $ctr];
    }

    /** @param ?array<int> $eventIds limit to these events (an organiser's own) */
    public function campaigns(?array $eventIds = null, ?string $status = null): array
    {
        return DB::table('event_ad_campaigns')->when($eventIds !== null, fn ($q) => $q->whereIn('event_id', $eventIds ?: [0]))->when($status, fn ($q, $s) => $q->where('status', $s))->orderByDesc('id')->limit(300)->get()->map(fn ($c) => $this->shape($c))->all();
    }

    public function decide(int $id, bool $approve, ?string $note): array
    {
        $c = DB::table('event_ad_campaigns')->where('id', $id)->first() ?? abort(404);
        if ($c->status !== 'pending') {
            throw new EventException('That campaign was already decided.');
        }
        if ($approve && $this->running((int) $c->product_id, $c->starts_on, $c->ends_on) >= (int) DB::table('event_ad_products')->where('id', $c->product_id)->value('max_slots')) {
            throw new EventException('The places for those dates have since been taken.');
        }
        DB::table('event_ad_campaigns')->where('id', $id)->update(['status' => $approve ? 'approved' : 'rejected', 'note' => $note, 'updated_at' => now()]);

        return $this->shape(DB::table('event_ad_campaigns')->find($id));
    }

    /** Invoice the advertiser in Books: to the client customer of the event, else the customer account of whoever asked for it. */
    public function invoice(int $id, ?User $by): array
    {
        $c = DB::table('event_ad_campaigns')->where('id', $id)->first() ?? abort(404);
        if ($c->status !== 'approved') {
            throw new EventException('Approve the campaign before invoicing it.');
        }
        if ($c->invoice_id) {
            throw new EventException('It was already invoiced.');
        }
        $ledger = EventSettings::all()['ads_ledger_id'] ?? null;
        $type = VoucherType::byBase(VoucherType::SALES);
        if (! $ledger || ! $type) {
            throw new EventException('Choose the income account advertising is invoiced to in Events → Configuration.');
        }
        $event = Event::withTrashed()->findOrFail($c->event_id);
        $customer = ($event->client_customer_id ? Customer::find($event->client_customer_id) : null) ?? ($c->requested_by ? User::find($c->requested_by)?->customer : null)
            ?? throw new EventException('There is no customer account to invoice. Ask the advertiser to sign up as a customer, or invoice them in Books by hand.');
        $p = DB::table('event_ad_products')->find($c->product_id);
        try {
            $v = $this->vouchers->create(['voucher_type_id' => $type->id, 'date' => today()->toDateString(), 'customer_id' => $customer->id, 'currency_id' => $customer->currency_id, 'narration' => "Promotion: {$p->name} for {$event->title}",
                'lines' => [['type' => 'custom', 'description' => "{$p->name}: {$event->title} ({$c->starts_on} to {$c->ends_on})", 'ledger_id' => (int) $ledger, 'quantity' => 1, 'rate' => (float) $c->amount]], 'meta' => ['event_ad' => (int) $id]], $by);
        } catch (\App\Services\Books\BooksException $e) {
            throw new EventException($e->getMessage(), previous: $e);
        }
        DB::table('event_ad_campaigns')->where('id', $id)->update(['invoice_id' => $v->id, 'updated_at' => now()]);

        return $this->shape(DB::table('event_ad_campaigns')->find($id));
    }

    public function cancel(int $id): array
    {
        DB::table('event_ad_campaigns')->where('id', $id)->whereIn('status', ['pending', 'approved'])->where('invoice_id', null)->update(['status' => 'cancelled', 'updated_at' => now()]);

        return $this->shape(DB::table('event_ad_campaigns')->find($id));
    }

    // ── showing ads, counting ────────────────────────────────────────────

    /** Campaigns running today of a kind, as event ids with the campaign to count against. @return array<int, int> event id => campaign id */
    public function live(string $kind, ?int $categoryId = null): array
    {
        if (! self::ready()) {
            return [];
        }
        $today = today()->toDateString();

        return DB::table('event_ad_campaigns as c')->join('event_ad_products as p', 'p.id', '=', 'c.product_id')->where('p.kind', $kind)->where('c.status', 'approved')->where('c.starts_on', '<=', $today)->where('c.ends_on', '>=', $today)
            ->when($categoryId, fn ($q) => $q->where('c.category_id', $categoryId))->orderBy('c.id')->pluck('c.id', 'c.event_id')->map(fn ($v) => (int) $v)->all();
    }

    public function count(int $campaignId, string $what): void
    {
        if (in_array($what, ['impressions', 'clicks'], true)) {
            DB::table('event_ad_campaigns')->where('id', $campaignId)->where('status', 'approved')->increment($what);
        }
    }

    /** Tickets were issued for an event: credit the live campaigns with the registrations. */
    public function registered(int $eventId, int $n): void
    {
        if (! self::ready() || $n < 1) {
            return;
        }
        $today = today()->toDateString();
        DB::table('event_ad_campaigns')->where('event_id', $eventId)->where('status', 'approved')->where('starts_on', '<=', $today)->where('ends_on', '>=', $today)->increment('registrations', $n);
    }
}
