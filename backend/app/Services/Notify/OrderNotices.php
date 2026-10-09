<?php

namespace App\Services\Notify;

use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use Illuminate\Support\Facades\DB;

/**
 * Tells a shopper what is happening to their order: received, paid, on its way, delivered, cancelled, and what staff decided about a cancellation request.
 * Only orders from the storefront. Each message is sent once (remembered on the order), goes to a customer's account or, for a guest, to the email and phone
 * given at checkout, and never raises: a problem telling someone must not undo what just happened.
 */
class OrderNotices
{
    public function __construct(private Notifier $notifier, private Staff $staff) {}

    // ------------------------------------------------------------ the events

    public function placed(Voucher $order): void
    {
        $this->safely($order, function () use ($order) {
            if (! $this->once($order, 'placed')) {
                return;
            }
            $pre = ! empty($order->meta['preorder']);
            $due = $pre ? $this->expected($order) : null;
            $this->tell($order, 'order_placed', ($pre ? 'Preorder ' : 'Order ') . $order->voucher_number . ' received',
                'Thank you! We have received ' . ($pre ? 'your preorder ' : 'your order ') . $order->voucher_number . ' for ' . $this->money($order, $order->total_amount) . '.'
                . (! empty($order->meta['deposit']) ? ' You are paying a deposit of ' . $this->money($order, $order->meta['deposit']['amount']) . ' now; the balance of ' . $this->money($order, $order->meta['deposit']['balance']) . ' is paid on delivery or online from your order page.' : '')
                . ($pre ? ' We will deliver it as soon as the stock arrives' . ($due ? " (expected by {$due})" : '') . '.' : ''));
        });
    }

    /** The order was converted: a Cash Sale means it is paid, a Delivery Note means goods are on their way. */
    public function converted(Voucher $source, Voucher $child): void
    {
        $this->safely($source, function () use ($source, $child) {
            $source->loadMissing('type');
            $child->loadMissing('type');
            if ($source->type?->base_type !== VoucherType::SALES_ORDER) {
                return;
            }
            $base = $child->type?->base_type;
            if ($base === VoucherType::CASH_SALE && $this->once($source, 'paid:' . $child->id)) {
                $this->paidMessage($source, $child);
            } elseif ($base === VoucherType::DELIVERY_NOTE && $this->once($source, 'shipped:' . $child->id)) {
                $this->shippedMessage($source);
            }
        });
    }

    /** An online payment against an invoice made from an order. */
    public function invoicePaid(Voucher $invoice, Voucher $receipt): void
    {
        $this->safely($invoice, function () use ($invoice, $receipt) {
            $order = $invoice->source_voucher_id ? Voucher::with('type')->find($invoice->source_voucher_id) : null;
            if ($order && $order->type?->base_type === VoucherType::SALES_ORDER && $this->once($order, 'paid:' . $receipt->id)) {
                $this->paidMessage($order, $receipt);
            }
        });
    }

    public function cancelled(Voucher $order): void
    {
        $this->safely($order, function () use ($order) {
            $order->loadMissing('type');
            if ($order->type?->base_type !== VoucherType::SALES_ORDER || ! $this->once($order, 'cancelled')) {
                return;
            }
            $this->tell($order, 'order_cancelled', 'Order ' . $order->voucher_number . ' cancelled', 'Your order ' . $order->voucher_number . ' has been cancelled.' . ($order->cancel_reason ? ' Reason: ' . $order->cancel_reason : '')
                . ' If you did not expect this, please contact us.');
        });
    }

    /** Staff decided a customer's request to cancel a paid preorder. */
    public function cancelDecision(Voucher $order, bool $approved, ?string $note, ?string $refundedTo): void
    {
        $this->safely($order, function () use ($order, $approved, $note, $refundedTo) {
            $at = $order->meta['cancel_request']['at'] ?? 'x';
            if (! $this->once($order, 'cancel_decided:' . $at . ':' . ($approved ? 'yes' : 'no'))) {
                return;
            }
            $this->tell($order, 'preorder_cancel_decided', $approved ? 'Preorder ' . $order->voucher_number . ' cancelled' : 'About your request to cancel ' . $order->voucher_number,
                $approved
                    ? 'We have cancelled preorder ' . $order->voucher_number . ' as you asked and will refund ' . (($d = $order->meta['cancel_request']['deposit_refund'] ?? null) ? 'your deposit of ' . $this->money($order, $d) : $this->money($order, $order->total_amount)) . ($refundedTo ? " ({$refundedTo})" : '') . '.' . ($note ? " {$note}" : '')
                    : 'We could not cancel preorder ' . $order->voucher_number . '.' . ($note ? " {$note}" : '') . ' It is still on its way to you. You can ask again from your order page, or contact us.');
        });
    }

    /** A customer asked to cancel a paid preorder: tell the people who decide. */
    public function cancelRequested(Voucher $order, ?string $reason): void
    {
        $this->safely($order, function () use ($order, $reason) {
            foreach ($this->staff->holding('books.post') as $staff) {
                $this->notifier->send($staff, 'preorder_cancel_requested', 'Cancellation requested: ' . $order->voucher_number,
                    ($this->who($order) ?: 'A customer') . ' asked to cancel preorder ' . $order->voucher_number . ' (' . $this->money($order, $order->total_amount) . ').' . ($reason ? ' “' . $reason . '”' : ''),
                    ['action_url' => '/admin/orders?tab=preorders', 'action_text' => 'Decide']);
            }
        });
    }

    // ------------------------------------------------------------ the messages

    private function paidMessage(Voucher $order, Voucher $payment): void
    {
        $pre = ! empty($order->meta['preorder']);
        $due = $pre ? $this->expected($order) : null;
        if (! empty($order->meta['deposit']) && ($left = $this->balanceLeft($order)) > 0.005) {   // a deposit came in, not the whole price
            $this->tell($order, 'payment_received', 'Deposit received for ' . $order->voucher_number,
                'We have received your payment of ' . $this->money($order, $payment->total_amount) . ' for preorder ' . $order->voucher_number . '. Thank you! The balance of ' . $this->money($order, $left)
                . ' is paid on delivery, or online any time from your order page. We will deliver it as soon as the stock arrives' . ($due ? " (expected by {$due})" : '') . '.');

            return;
        }
        $this->tell($order, 'payment_received', 'Payment received for ' . $order->voucher_number,
            'We have received your payment of ' . $this->money($order, $payment->total_amount ?: $order->total_amount) . ' for ' . ($pre ? 'preorder ' : 'order ') . $order->voucher_number . '. Thank you!'
            . ($pre ? ' We will deliver it as soon as the stock arrives' . ($due ? " (expected by {$due})" : '') . '.' : ''));
    }

    private function shippedMessage(Voucher $order): void
    {
        $t = DB::table('voucher_items')->where('voucher_id', $order->id)->where('is_header', 0)->whereNotNull('variant_id')
            ->selectRaw('COALESCE(SUM(quantity), 0) AS q, COALESCE(SUM(delivered_quantity), 0) AS d')->first();
        $all = (float) $t->q > 0 && (float) $t->d + 0.00005 >= (float) $t->q;
        $n = $order->voucher_number;
        $text = $all ? "Everything in order {$n} has been delivered. Thank you for shopping with us!"
            : "Part of order {$n} is on its way to you (" . $this->plain((float) $t->d) . ' of ' . $this->plain((float) $t->q) . ' items). The rest follows as soon as it is ready.';
        if (! empty($order->meta['deposit']) && ($left = $this->balanceLeft($order)) > 0.005) {   // a deposit order: say what is still to pay
            $text .= ' The balance of ' . $this->money($order, $left) . ' is due on delivery, or you can pay it online from your order page.';
        }
        $this->tell($order, $all ? 'order_delivered' : 'order_shipped', $all ? "Order {$n} delivered" : "Order {$n} is on its way", $text);
    }

    // ------------------------------------------------------------ plumbing

    /** Send to the customer's account, or, for a guest, to the email and phone given at checkout. */
    public function tell(Voucher $order, string $type, string $title, string $message): void
    {
        $o = $order->customer_id ? ['action_url' => '/orders/' . $order->id, 'action_text' => 'View order'] : [];
        $customer = $order->customer_id ? $order->customer : null;
        if ($customer) {
            $this->notifier->send($customer, $type, $title, $message, $o);

            return;
        }
        $c = $order->meta['contact'] ?? [];
        $this->notifier->sendToContact(['name' => $c['name'] ?? $order->party_name, 'email' => $c['email'] ?? null, 'phone' => $c['phone'] ?? $order->party_phone], $type, $title, $message, $o);
    }

    /** What the invoice made from a deposit order still asks for (0 when it is not one, or nothing is left). */
    private function balanceLeft(Voucher $order): float
    {
        $invoice = $order->children()->with('type')->where('status', Voucher::POSTED)->get()->first(fn ($c) => $c->type?->base_type === VoucherType::SALES);

        return $invoice ? max(0.0, round(app(\App\Services\Books\VoucherService::class)->outstanding($invoice), 2)) : 0.0;
    }

    private function who(Voucher $order): ?string
    {
        $c = $order->customer;

        return $c ? trim($c->first_name . ' ' . $c->last_name) : ($order->meta['contact']['name'] ?? $order->party_name);
    }

    /** Only storefront orders; never throws. */
    private function safely(Voucher $order, callable $fn): void
    {
        try {
            if ($order->channel === 'storefront' || ! empty($order->meta['preorder'])) {
                $fn();
            }
        } catch (\Throwable $e) {
            report($e);
        }
    }

    /** True the first time a message with this key is sent for the order (and remembers it); false after. */
    private function once(Voucher $order, string $key): bool
    {
        $fresh = Voucher::find($order->id) ?? $order;
        $meta = $fresh->meta ?? [];
        if (isset($meta['notices'][$key])) {
            return false;
        }
        $meta['notices'][$key] = now()->toDateTimeString();
        $fresh->meta = $meta;
        $fresh->save();
        $order->meta = $meta;

        return true;
    }

    private function money(Voucher $order, $amount): string
    {
        $order->loadMissing('currency');

        return trim(($order->currency?->code ?? '') . ' ' . number_format((float) $amount, 2));
    }

    private function plain(float $n): string
    {
        return rtrim(rtrim(number_format($n, 2, '.', ''), '0'), '.');
    }

    private function expected(Voucher $order): ?string
    {
        try {
            return \Illuminate\Support\Facades\Schema::hasTable('preorder_lines') ? (DB::table('preorder_lines')->where('voucher_id', $order->id)->max('promised_date') ?: null) : null;
        } catch (\Throwable) {
            return null;
        }
    }
}
