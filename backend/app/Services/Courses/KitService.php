<?php

namespace App\Services\Courses;

use App\Models\Currency;
use App\Models\Books\VoucherType;
use App\Models\Courses\Enrolment;
use App\Models\Courses\KitHandout;
use App\Models\Courses\KitItem;
use App\Models\Courses\Offering;
use App\Models\Location;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Books\VoucherService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Cooking kits. An offering lists the stock items each student is handed. The kit is paid for through an ordinary fee (a "Materials or kit" fee) so the invoice and any refund are untouched;
 * handing the kit over takes the items out of stock on a delivery note (following a zero-value sales order for the student), so stock and cost of sales stay right. A shortage is noted
 * for staff and never stops the hand-over.
 */
class KitService
{
    public function __construct(private VoucherService $vouchers)
    {
    }

    public static function installed(): bool
    {
        return Schema::hasTable('course_kit_items') && Schema::hasTable('course_kit_handouts');
    }

    /** @return array<int, array<string, mixed>> */
    public function items(Offering $o): array
    {
        if (! self::installed()) {
            return [];
        }
        $rows = KitItem::where('offering_id', $o->id)->orderBy('sort_order')->orderBy('id')->get();
        $names = DB::table('product_variants as pv')->join('products as p', 'p.id', '=', 'pv.product_id')->whereIn('pv.id', $rows->pluck('variant_id'))->get(['pv.id', 'p.name', 'pv.sku'])->keyBy('id');

        return $rows->map(fn (KitItem $k) => ['id' => $k->id, 'variant_id' => (int) $k->variant_id, 'name' => $names[$k->variant_id]->name ?? 'Item '.$k->variant_id, 'sku' => $names[$k->variant_id]->sku ?? null, 'quantity' => (float) $k->quantity, 'note' => $k->note])->all();
    }

    /** Replace the kit with this list. @param array<int, array{variant_id?: mixed, quantity?: mixed, note?: mixed}> $items */
    public function setItems(Offering $o, array $items): array
    {
        if (! self::installed()) {
            throw new BooksException('Run database script 161_courses_recipes_kits.sql first.');
        }
        if (count($items) > 40) {
            throw new BooksException('A kit holds up to 40 items.');
        }
        $rows = [];
        foreach ($items as $i) {
            $v = (int) ($i['variant_id'] ?? 0);
            $q = round((float) ($i['quantity'] ?? 0), 3);
            if (! $v || ! DB::table('product_variants')->where('id', $v)->exists()) {
                throw new BooksException('One of the kit items is not a stock item.');
            }
            if ($q <= 0 || $q > 100000) {
                throw new BooksException('Give how many of each item go in the kit.');
            }
            if (isset($rows[$v])) {
                throw new BooksException('An item is in the kit twice: use one line with the total.');
            }
            $rows[$v] = ['variant_id' => $v, 'quantity' => $q, 'note' => ($n = trim((string) ($i['note'] ?? ''))) === '' ? null : mb_substr($n, 0, 160)];
        }
        DB::transaction(function () use ($o, $rows) {
            KitItem::where('offering_id', $o->id)->delete();
            $n = 0;
            foreach ($rows as $r) {
                KitItem::create($r + ['offering_id' => $o->id, 'sort_order' => $n += 10]);
            }
        });

        return $this->items($o);
    }

    /** @return array<int, array<string, mixed>> the students of the offering and whether each has their kit */
    public function handouts(Offering $o): array
    {
        if (! self::installed()) {
            return [];
        }
        $enr = Enrolment::where('offering_id', $o->id)->whereIn('status', ['active', 'completed'])->orderBy('id')->limit(500)->get();
        $names = User::whereIn('id', $enr->pluck('student_user_id'))->pluck('name', 'id');
        $done = KitHandout::where('offering_id', $o->id)->get()->keyBy('enrolment_id');

        return $enr->map(fn (Enrolment $e) => ['enrolment_id' => $e->id, 'student' => $names[$e->student_user_id] ?? 'Student', 'number' => $e->number, 'balance' => $e->balance(),
            'handed_at' => ($h = $done[$e->id] ?? null)?->handed_at?->toIso8601String(), 'stock_note' => $h?->stock_note])->all();
    }

    /** The kit leaves stock for one enrolled student. A kit is handed over once per enrolment. */
    public function handOut(Offering $o, Enrolment $e, ?User $by = null): KitHandout
    {
        if (! self::installed()) {
            throw new BooksException('Run database script 161_courses_recipes_kits.sql first.');
        }
        if ((int) $e->offering_id !== (int) $o->id || ! in_array($e->status, ['active', 'completed'], true)) {
            throw new BooksException('Only an enrolled student of this offering gets a kit.');
        }
        $items = KitItem::where('offering_id', $o->id)->get();
        if ($items->isEmpty()) {
            throw new BooksException('This offering has no kit.');
        }
        if (KitHandout::where('enrolment_id', $e->id)->exists()) {
            throw new BooksException('This student has their kit already.');
        }
        $student = User::findOrFail($e->student_user_id);
        $customer = $student->customer;
        $order = $delivery = null;
        $note = null;
        if (! $customer) {
            $note = 'Stock was not taken: the student has no customer account.';
        } else {
            try {
                $loc = $o->location_id ?: (Location::where('is_default', true)->value('id') ?: Location::orderBy('id')->value('id'));
                $variants = DB::table('product_variants')->whereIn('id', $items->pluck('variant_id'))->get()->keyBy('id');
                $lines = $items->map(fn (KitItem $k) => ['type' => 'product', 'product_id' => (int) $variants[$k->variant_id]->product_id, 'variant_id' => (int) $k->variant_id, 'quantity' => (float) $k->quantity, 'rate' => 0.0, 'location_id' => $loc])->all();
                $order = $this->vouchers->placeOrder(['date' => today(config('app.timezone', 'Africa/Nairobi'))->toDateString(), 'location_id' => $loc, 'currency_id' => Currency::getBaseCurrency()?->id, 'customer_id' => $customer->id, 'channel' => 'storefront', 'lines' => $lines,
                    'narration' => "Cooking kit for {$e->number}: {$o->title}", 'meta' => ['contact' => ['name' => $student->name, 'email' => $student->email, 'phone' => $customer->phone ?? null], 'course_kit_enrolment_id' => $e->id]], $by);
                $delivery = $this->vouchers->convert($order, VoucherType::DELIVERY_NOTE, ['reference_no' => $e->number], $by);
            } catch (\Throwable $ex) {
                $note = 'Stock was not taken: '.mb_substr($ex->getMessage(), 0, 250);
                report($ex);
            }
        }

        return KitHandout::create(['offering_id' => $o->id, 'enrolment_id' => $e->id, 'user_id' => $student->id, 'order_id' => $order?->id, 'delivery_id' => $delivery?->id, 'stock_note' => $note, 'handed_at' => now(), 'handed_by' => $by?->id]);
    }

    /** What a student sees: what is in the kit and whether they have it. @return array{items: array<int, array{name: string, quantity: float, note: ?string}>, handed_at: ?string}|null */
    public function forStudent(Offering $o, ?User $u): ?array
    {
        if (! self::installed() || ! KitItem::where('offering_id', $o->id)->exists()) {
            return null;
        }
        $h = $u ? KitHandout::where('offering_id', $o->id)->where('user_id', $u->id)->first() : null;

        return ['items' => array_map(fn ($i) => ['name' => $i['name'], 'quantity' => $i['quantity'], 'note' => $i['note']], $this->items($o)), 'handed_at' => $h?->handed_at?->toIso8601String()];
    }
}
