<?php

namespace App\Services\Events;

use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\Customer;
use App\Models\Events\Event;
use App\Models\Events\EventOrganiser;
use App\Models\Notification;
use App\Models\User;
use App\Services\Books\QuotationService;
use App\Services\Books\VoucherService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * A customer hires TISL to plan an event. The enquiry moves: new -> consulting -> quoted -> accepted (a quotation became a sales order, an event project opened) -> invoiced in Books.
 * Quotations, orders and invoices are the Books' own vouchers; this keeps the thread that joins them to the customer, the event project and the Budgets initiative.
 */
final class EventEnquiries
{
    public const STATUSES = ['new', 'consulting', 'quoted', 'accepted', 'declined', 'closed'];

    public function __construct(private VoucherService $vouchers, private QuotationService $quotes, private EventEditor $editor)
    {
    }

    public static function ready(): bool
    {
        return Schema::hasTable('event_enquiries');
    }

    // ── the customer ─────────────────────────────────────────────────────

    public function create(User $user, array $in): array
    {
        $type = trim((string) ($in['event_type'] ?? ''));
        $name = trim((string) ($in['name'] ?? $user->name ?? ''));
        if ($type === '' || $name === '') {
            throw ValidationException::withMessages(['event_type' => 'Say what kind of event it is.', 'name' => 'Give your name.']);
        }
        if (! empty($in['budget_min']) && ! empty($in['budget_max']) && (float) $in['budget_min'] > (float) $in['budget_max']) {
            throw ValidationException::withMessages(['budget_max' => 'The top of the budget is below the bottom.']);
        }
        $id = DB::table('event_enquiries')->insertGetId(['reference' => 'EQ' . strtoupper(Str::random(7)), 'customer_id' => $user->customer?->id, 'user_id' => $user->id, 'name' => $name,
            'email' => $in['email'] ?? $user->email, 'phone' => $in['phone'] ?? null, 'event_type' => mb_substr($type, 0, 80), 'category_id' => $in['category_id'] ?? null, 'event_date' => $in['event_date'] ?? null,
            'guests' => $in['guests'] ?? null, 'budget_min' => $in['budget_min'] ?? null, 'budget_max' => $in['budget_max'] ?? null, 'location' => $in['location'] ?? null, 'notes' => $in['notes'] ?? null,
            'consultation_at' => $in['consultation_at'] ?? null, 'status' => 'new', 'created_at' => now(), 'updated_at' => now()]);
        $this->tellStaff($id, $name, $type);

        return $this->shape($this->row($id), false);
    }

    private function tellStaff(int $id, string $name, string $type): void
    {
        try {
            foreach (User::withPermission('events.admin')->get() as $u) {
                Notification::createFor($u, 'event_enquiry', 'New event planning enquiry', "{$name} asked TISL to plan: {$type}.", '/admin/events?tab=enquiries', 'Open', ['enquiry_id' => $id], ['database'], 'normal');
            }
        } catch (\Throwable $e) {
            report($e);
        }
    }

    /** What the customer sees of their own enquiries: where it stands, the documents in Books, and the progress of the project. */
    public function mine(User $user): array
    {
        return DB::table('event_enquiries')->where(fn ($q) => $q->where('user_id', $user->id)->when($user->customer?->id, fn ($w, $c) => $w->orWhere('customer_id', $c)))
            ->orderByDesc('id')->get()->map(fn ($r) => $this->shape($r, false))->all();
    }

    // ── staff ────────────────────────────────────────────────────────────

    public function row(int $id): object
    {
        return DB::table('event_enquiries')->where('id', $id)->first() ?? abort(404);
    }

    public function adminList(?string $status): array
    {
        return DB::table('event_enquiries')->when($status, fn ($q, $s) => $q->where('status', $s))->orderByDesc('id')->limit(300)->get()->map(fn ($r) => $this->shape($r, true))->all();
    }

    public function shape(object $r, bool $staff): array
    {
        $doc = fn (?int $id) => $id ? Voucher::whereKey($id)->first(['id', 'voucher_number', 'doc_status', 'status', 'total_amount']) : null;
        $out = ['id' => (int) $r->id, 'reference' => $r->reference, 'name' => $r->name, 'email' => $r->email, 'phone' => $r->phone, 'event_type' => $r->event_type, 'event_date' => $r->event_date, 'guests' => $r->guests,
            'budget_min' => $r->budget_min !== null ? (float) $r->budget_min : null, 'budget_max' => $r->budget_max !== null ? (float) $r->budget_max : null, 'location' => $r->location, 'notes' => $r->notes,
            'consultation_at' => $r->consultation_at, 'status' => $r->status, 'created_at' => (string) $r->created_at, 'event_id' => $r->event_id ? (int) $r->event_id : null,
            'quotation' => $doc($r->quotation_id)?->only(['id', 'voucher_number', 'doc_status', 'total_amount']), 'order' => $doc($r->order_id)?->only(['id', 'voucher_number', 'total_amount']),
            'invoice' => $doc($r->invoice_id)?->only(['id', 'voucher_number', 'total_amount'])];
        if ($r->event_id && Schema::hasTable('event_tasks')) {
            $tasks = DB::table('event_tasks')->where('event_id', $r->event_id)->where('client_visible', 1);
            $out['progress'] = ['tasks' => (clone $tasks)->count(), 'done' => (clone $tasks)->where('status', 'done')->count(),
                'milestones' => DB::table('event_milestones')->where('event_id', $r->event_id)->where('client_visible', 1)->orderBy('due_on')->get(['title', 'due_on', 'done_at'])->all()];
        }

        return $out + ($staff ? ['customer_id' => $r->customer_id ? (int) $r->customer_id : null, 'assigned_to' => $r->assigned_to ? (int) $r->assigned_to : null, 'admin_notes' => $r->admin_notes] : []);
    }

    public function update(int $id, array $in): array
    {
        $r = $this->row($id);
        $set = array_intersect_key($in, array_flip(['consultation_at', 'assigned_to', 'admin_notes', 'customer_id']));
        if (isset($in['status'])) {
            if (! in_array($in['status'], self::STATUSES, true)) {
                throw ValidationException::withMessages(['status' => 'Unknown status.']);
            }
            $set['status'] = $in['status'];
        }
        DB::table('event_enquiries')->where('id', $r->id)->update($set + ['updated_at' => now()]);

        return $this->shape($this->row($id), true);
    }

    private function customerOf(object $r): Customer
    {
        return ($r->customer_id ? Customer::find($r->customer_id) : null) ?? throw new EventException('This enquiry has no customer account yet: the person must sign up as a customer first, or choose the customer on the enquiry.');
    }

    /**
     * Price the work: lines of {description, quantity, rate}. A quotation is made in Books for the customer and sent to them.
     *
     * @param array<int, array{description: string, quantity?: float, rate: float}> $lines
     */
    public function quote(int $id, array $lines, ?User $by): array
    {
        $r = $this->row($id);
        $customer = $this->customerOf($r);
        $ledger = EventSettings::all()['planning_ledger_id'] ?? null;
        if (! $ledger) {
            throw new EventException('Choose the income account event planning fees are booked to in Events → Configuration.');
        }
        $built = [];
        foreach ($lines as $l) {
            if (trim((string) ($l['description'] ?? '')) === '' || (float) ($l['rate'] ?? 0) <= 0) {
                continue;
            }
            $built[] = ['type' => 'custom', 'description' => trim($l['description']), 'ledger_id' => (int) $ledger, 'quantity' => max(0.0001, (float) ($l['quantity'] ?? 1)), 'rate' => (float) $l['rate']];
        }
        if (! $built) {
            throw new EventException('Add at least one priced line.');
        }
        $type = VoucherType::byBase(VoucherType::QUOTATION) ?? throw new EventException('Quotations are switched off in Books.');

        return DB::transaction(function () use ($r, $customer, $built, $type, $by) {
            $q = $this->vouchers->create(['voucher_type_id' => $type->id, 'date' => today()->toDateString(), 'customer_id' => $customer->id, 'currency_id' => $customer->currency_id, 'lines' => $built,
                'doc_status' => 'requested', 'channel' => 'staff', 'narration' => "Event planning: {$r->event_type} ({$r->reference})", 'meta' => ['event_enquiry' => (int) $r->id]], $by);
            $this->quotes->send($q, $by);
            DB::table('event_enquiries')->where('id', $r->id)->update(['quotation_id' => $q->id, 'status' => 'quoted', 'updated_at' => now()]);

            return $this->shape($this->row($r->id), true);
        });
    }

    /** The customer (or staff for them) said yes: the quotation becomes a sales order and the event project opens. */
    public function accept(int $id, ?User $by): array
    {
        $r = $this->row($id);
        if (! $r->quotation_id) {
            throw new EventException('There is no quotation to accept yet.');
        }
        return DB::transaction(function () use ($r, $by) {
            if (! $r->order_id) {
                $order = $this->quotes->accept(Voucher::findOrFail($r->quotation_id), $by);
                DB::table('event_enquiries')->where('id', $r->id)->update(['order_id' => $order->id, 'updated_at' => now()]);
            }
            DB::table('event_enquiries')->where('id', $r->id)->update(['status' => 'accepted', 'updated_at' => now()]);
            $this->openProject($r->id, $by);

            return $this->shape($this->row($r->id), true);
        });
    }

    /** Invoice the order in Books (staged invoices and deposits are then handled in Books as for any order). */
    public function invoice(int $id, ?User $by): array
    {
        $r = $this->row($id);
        if (! $r->order_id) {
            throw new EventException('Accept the quotation first: the invoice is made from the sales order.');
        }
        if ($r->invoice_id) {
            throw new EventException('An invoice was already made.');
        }
        try {
            $inv = $this->vouchers->convert(Voucher::findOrFail($r->order_id), VoucherType::SALES, [], $by);
        } catch (\App\Services\Books\BooksException $e) {
            throw new EventException($e->getMessage(), previous: $e);
        }
        DB::table('event_enquiries')->where('id', $r->id)->update(['invoice_id' => $inv->id, 'updated_at' => now()]);

        return $this->shape($this->row($id), true);
    }

    /** The event project: a private event owned by TISL for this client, with a Budgets initiative so supplier bills posted to it show against the event. */
    public function openProject(int $id, ?User $by): Event
    {
        $r = $this->row($id);
        if ($r->event_id && ($e = Event::withTrashed()->find($r->event_id))) {
            return $e;
        }
        $internal = EventOrganiser::where('is_internal', 1)->first();
        $title = mb_substr("{$r->event_type} — {$r->name}", 0, 200);
        $event = Event::create(['title' => $title, 'kind' => 'in_person', 'status' => 'draft', 'is_listed' => false, 'is_project' => true, 'enquiry_id' => $r->id, 'organiser_id' => $internal?->id,
            'client_customer_id' => $r->customer_id, 'category_id' => $r->category_id, 'approval_status' => 'approved', 'participation' => 'invitation', 'venue_name' => $r->location,
            'manager_user_id' => $r->assigned_to, 'created_by' => $by?->id]);
        $initiative = null;
        if (Schema::hasTable('budget_initiatives')) {
            $initiative = DB::table('budget_initiatives')->insertGetId(['name' => mb_substr("Event: {$title}", 0, 120), 'note' => "Event project {$r->reference}", 'is_active' => 1, 'created_by' => $by?->id, 'created_at' => now(), 'updated_at' => now()]);
            $event->update(['initiative_id' => $initiative]);
        }
        DB::table('event_enquiries')->where('id', $r->id)->update(['event_id' => $event->id, 'updated_at' => now()]);

        return $event;
    }
}
