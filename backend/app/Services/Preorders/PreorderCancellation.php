<?php

namespace App\Services\Preorders;

use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\Ticket;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Books\VoucherService;
use Illuminate\Support\Facades\DB;

/**
 * A customer cancels a PAID preorder (docs/PREORDER_PLAN.md): they ask, staff decide.
 *   - An order not yet paid has no sale behind it and is cancelled by the customer directly (CheckoutController::cancelOrder); this is for the rest.
 *   - They can ask only while nothing on the order has been delivered. Once any of it has gone out, the rest is settled with staff by hand.
 *   - Asking opens a help-desk ticket and records `meta.cancel_request` on the Sales Order. Nothing moves until staff approve.
 *   - Approving writes ONE credit note against the sale for everything still owed (goods that never left the shelf put nothing back in stock) and, for a sale
 *     paid at the till, gives the money back from the ledger staff choose, in the same step. The places the order held are free again because they are worked out
 *     from live orders less credits. Declining records the reason; the customer may ask again.
 * Nothing here is stored beyond that one `cancel_request` entry: state is {status: requested|approved|declined, ...}.
 */
class PreorderCancellation
{
    public function __construct(private VoucherService $vouchers, private PreorderService $preorders) {}

    public function stateOf(Voucher $order): ?string
    {
        return $order->meta['cancel_request']['status'] ?? null;
    }

    /** The live Cash Sale or Invoice made from the order (the paid side of a preorder), if any. */
    public function saleOf(Voucher $order): ?Voucher
    {
        return $order->children()->with('type')->where('status', Voucher::POSTED)->get()
            ->first(fn ($c) => in_array($c->type?->base_type, [VoucherType::CASH_SALE, VoucherType::SALES], true));
    }

    /** How much of the order has gone out (base lines, all components). */
    public function delivered(Voucher $order): float
    {
        return (float) DB::table('voucher_items')->where('voucher_id', $order->id)->where('is_header', 0)->whereNotNull('variant_id')->sum('delivered_quantity');
    }

    /**
     * What the customer may do on this order: `can_request`, the request's `state` (requested|approved|declined|null), the staff `note` when declined,
     * and, when they can not, a `reason` (not_preorder | cancelled | requested | approved | not_paid | delivered).
     *
     * @return array{can_request: bool, state: ?string, note: ?string, reason: ?string}
     */
    public function eligibility(Voucher $order): array
    {
        $state = $this->stateOf($order);
        $out = fn (bool $can, ?string $reason) => ['can_request' => $can, 'state' => $state, 'note' => $state === 'declined' ? ($order->meta['cancel_request']['note'] ?? null) : null, 'reason' => $reason];

        if (empty($order->meta['preorder'])) {
            return $out(false, 'not_preorder');
        }
        if ($order->status !== Voucher::POSTED) {
            return $out(false, 'cancelled');
        }
        if ($state === 'requested' || $state === 'approved') {
            return $out(false, $state);
        }
        if (! $this->saleOf($order)) {
            return $out(false, 'not_paid');   // nothing was paid or invoiced: the ordinary Cancel order does it
        }
        if ($this->delivered($order) > 0.00005) {
            return $out(false, 'delivered');
        }

        return $out(true, null);
    }

    /** The customer asks to cancel. Opens a help-desk ticket for staff and records the request; returns the ticket number. */
    public function request(Voucher $order, string $reason, int $customerId): string
    {
        return DB::transaction(function () use ($order, $reason, $customerId) {
            $order = Voucher::whereKey($order->id)->lockForUpdate()->firstOrFail();
            $e = $this->eligibility($order);
            if (! $e['can_request']) {
                throw new BooksException(match ($e['reason']) {
                    'requested' => 'You have already asked to cancel this order. We will get back to you.',
                    'delivered' => 'Part of this order has already been delivered, so please contact us to settle the rest.',
                    'approved' => 'This order has already been cancelled.',
                    'not_paid' => 'This order has not been paid yet: use Cancel order.',
                    default => 'This order can not be cancelled here.',
                });
            }
            $prefix = 'TKT-' . now()->format('Y') . '-';
            $last = Ticket::withTrashed()->where('ticket_number', 'like', $prefix . '%')->orderByDesc('id')->value('ticket_number');
            $ticket = Ticket::create([
                'ticket_number' => $prefix . str_pad($last ? ((int) substr($last, strlen($prefix))) + 1 : 1, 5, '0', STR_PAD_LEFT), 'customer_id' => $customerId,
                'subject' => "Cancel preorder {$order->voucher_number}", 'description' => $reason, 'priority' => 'medium', 'category' => 'billing', 'status' => 'open',
            ]);
            $this->remember($order, ['status' => 'requested', 'at' => now()->toDateTimeString(), 'reason' => $reason, 'ticket' => $ticket->ticket_number]);

            return $ticket->ticket_number;
        });
    }

    /** Requests waiting for staff, oldest first, each with what approving would refund and where from. */
    public function pending(): array
    {
        $out = [];
        foreach (Voucher::where('meta->cancel_request->status', 'requested')->with(['customer:id,first_name,last_name,email', 'children.type'])->orderBy('id')->get() as $o) {
            $sale = $o->children->where('status', Voucher::POSTED)->first(fn ($c) => in_array($c->type?->base_type, [VoucherType::CASH_SALE, VoucherType::SALES], true));
            $paidAtOnce = $sale ? $this->vouchers->paidAtOnce($sale) : false;
            $ret = $sale ? $this->vouchers->returnable($sale) : null;
            $out[] = [
                'order_id' => $o->id, 'number' => $o->voucher_number, 'customer' => trim(($o->customer?->first_name ?? '') . ' ' . ($o->customer?->last_name ?? '')) ?: ($o->party_name ?? '—'),
                'email' => $o->customer?->email, 'total' => (float) $o->total_amount, 'requested_at' => $o->meta['cancel_request']['at'] ?? null, 'reason' => $o->meta['cancel_request']['reason'] ?? null,
                'ticket' => $o->meta['cancel_request']['ticket'] ?? null,
                'sale' => $sale ? ['id' => $sale->id, 'number' => $sale->voucher_number, 'kind' => $paidAtOnce ? 'paid' : 'invoiced'] : null,
                'refund' => $paidAtOnce && $ret ? $ret['refund'] : null,   // {ledgers, default_id}: where the money can go back from
                'blocked' => ! $sale ? 'There is no paid sale behind this order any more.' : ($this->delivered($o) > 0.00005 ? 'Part of it has been delivered since: settle it by hand with a credit note.' : null),
            ];
        }

        return $out;
    }

    /**
     * Staff approve: one credit note for everything still reversible on the sale, money back from `$refundLedgerId` when the sale was paid at the till.
     *
     * @return Voucher the credit note
     */
    public function approve(Voucher $order, ?int $refundLedgerId, ?string $note, ?User $by): Voucher
    {
        return DB::transaction(function () use ($order, $refundLedgerId, $note, $by) {
            $order = Voucher::whereKey($order->id)->lockForUpdate()->firstOrFail();
            if ($this->stateOf($order) !== 'requested') {
                throw new BooksException('There is no cancellation request waiting on this order.');
            }
            $sale = $this->saleOf($order) ?? throw new BooksException('There is no paid sale behind this order any more.');
            if ($this->delivered($order) > 0.00005) {
                throw new BooksException('Part of this order has been delivered since the request. Settle it by hand with a credit note.');
            }
            $ret = $this->vouchers->returnable($sale);
            $lines = [];
            foreach ($ret['lines'] as $l) {
                if ($l['available_amount'] <= 0.005) {
                    continue;
                }
                $lines[] = $l['is_charge']
                    ? ['item_id' => $l['id'], 'mode' => 'adjust', 'amount' => $l['available_amount']]
                    : ['item_id' => $l['id'], 'mode' => 'return', 'quantity' => $l['available_quantity']];
            }
            if (! $lines) {
                throw new BooksException('Everything on this sale has already been reversed.');
            }
            $opts = ['lines' => $lines, 'reason' => 'Cancelled by customer', 'narration' => "Preorder {$order->voucher_number} cancelled at the customer's request"];
            if ($this->vouchers->paidAtOnce($sale)) {
                $opts['refund_ledger_id'] = $refundLedgerId ?: ($ret['refund']['default_id'] ?? null) ?: throw new BooksException('Choose where the refund is paid from.');
            }
            $credit = $this->vouchers->createReturn($sale, $opts, $by);

            $req = $order->meta['cancel_request'];
            $this->remember($order, ['status' => 'approved', 'decided_at' => now()->toDateTimeString(), 'decided_by' => $by?->id, 'note' => $note ?: null, 'credit_note' => $credit->voucher_number,
                'refunded_to' => $credit->meta['refunded_to'] ?? null] + $req);
            $this->resolveTicket($req['ticket'] ?? null);
            $this->preorders->touched($order);

            return $credit;
        });
    }

    /** Staff decline, with the reason the customer will read. The customer may ask again. */
    public function decline(Voucher $order, string $note, ?User $by): void
    {
        DB::transaction(function () use ($order, $note, $by) {
            $order = Voucher::whereKey($order->id)->lockForUpdate()->firstOrFail();
            if ($this->stateOf($order) !== 'requested') {
                throw new BooksException('There is no cancellation request waiting on this order.');
            }
            $req = $order->meta['cancel_request'];
            $this->remember($order, ['status' => 'declined', 'decided_at' => now()->toDateTimeString(), 'decided_by' => $by?->id, 'note' => $note] + $req);
            $this->resolveTicket($req['ticket'] ?? null);
        });
    }

    private function remember(Voucher $order, array $request): void
    {
        $meta = $order->meta ?? [];
        $meta['cancel_request'] = $request;
        $order->meta = $meta;
        $order->save();
    }

    private function resolveTicket(?string $number): void
    {
        if ($number) {
            Ticket::where('ticket_number', $number)->whereNotIn('status', ['resolved', 'closed'])->update(['status' => 'resolved']);
        }
    }
}
