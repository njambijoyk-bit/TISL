<?php

namespace App\Services\Courses;

use App\Models\Books\PaymentMethod;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\Courses\Book;
use App\Models\Courses\BookOrder;
use App\Models\Courses\CourseFile;
use App\Models\Currency;
use App\Models\Location;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Books\GatewayPaymentService;
use App\Services\Books\VoucherService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\URL;

/**
 * Selling books, through the books. An order is a Sales Order and an invoice with the book as its line (a printed copy with a stock item is a stock line, anything else a line on the book's sales account).
 * Payment is one payment of the whole total: M-Pesa or card through the gateways, or a receipt at the counter. A digital book is delivered the moment it is paid (a short-lived download link, a limited number of times);
 * a printed copy is delivered or collected and leaves stock then, on a delivery note. A refund is a credit note.
 */
class BookSales
{
    public function __construct(private VoucherService $vouchers, private GatewayPaymentService $gateway, private CourseFiles $files)
    {
    }

    public static function installed(): bool
    {
        return BookLibrary::installed();
    }

    /** @return string[] how this book may reach the buyer */
    public function ways(Book $b): array
    {
        return array_values(array_filter([$b->hasDigital() && $b->file_id ? 'digital' : null, $b->hasPrinted() ? 'delivery' : null, $b->hasPrinted() ? 'pickup' : null]));
    }

    private function payload(Book $b, BookOrder $o, User $buyer): array
    {
        $loc = Location::where('is_default', true)->value('id') ?: Location::orderBy('id')->value('id');
        $variant = $o->fulfil !== 'digital' && $b->stock_variant_id ? DB::table('product_variants')->where('id', $b->stock_variant_id)->first() : null;
        $line = $variant
            ? ['type' => 'product', 'product_id' => (int) $variant->product_id, 'variant_id' => (int) $variant->id, 'quantity' => (float) $o->quantity, 'rate' => (float) $o->unit_price, 'location_id' => $loc]
            : ['type' => 'custom', 'description' => $b->title.($o->fulfil === 'digital' ? ' (digital)' : ''), 'quantity' => (float) $o->quantity, 'rate' => (float) $o->unit_price, 'ledger_id' => (int) $b->ledger_id];

        return ['date' => today(config('app.timezone', 'Africa/Nairobi'))->toDateString(), 'location_id' => $loc, 'currency_id' => Currency::getBaseCurrency()?->id, 'customer_id' => $o->customer_id, 'channel' => 'storefront', 'lines' => [$line],
            'narration' => "Book order {$o->number}: {$b->title}", 'meta' => ['contact' => ['name' => $buyer->name, 'email' => $buyer->email, 'phone' => $o->phone], 'course_book_order_id' => $o->id]];
    }

    /** What an order would cost, tax included. @return array{unit_price: float, quantity: int, subtotal: float, total: float, ways: string[]} */
    public function quote(Book $b, int $quantity, User $buyer): array
    {
        $q = $b->hasPrinted() ? max(1, min(50, $quantity)) : 1;
        $o = new BookOrder(['number' => 'quote', 'quantity' => $q, 'unit_price' => $b->price, 'fulfil' => $b->hasPrinted() ? 'delivery' : 'digital', 'customer_id' => $buyer->customer?->id]);
        $o->id = 0;
        $total = round((float) $this->vouchers->preview($this->payload($b, $o, $buyer), null)['total'], 2);

        return ['unit_price' => (float) $b->price, 'quantity' => $q, 'subtotal' => round((float) $b->price * $q, 2), 'total' => $total, 'ways' => $this->ways($b)];
    }

    /** @param array{quantity?: mixed, fulfil?: mixed, address?: mixed, phone?: mixed} $in */
    public function order(Book $b, User $buyer, array $in, ?User $by = null, string $channel = 'online'): BookOrder
    {
        if (! self::installed()) {
            throw new BooksException('Run database script 156_courses_books.sql first.');
        }
        if (! $b->is_active) {
            throw new BooksException('That book is not on sale.');
        }
        $fulfil = (string) ($in['fulfil'] ?? '');
        if (! in_array($fulfil, $this->ways($b), true)) {
            throw new BooksException('Choose how you want it: '.implode(', ', array_map(fn ($w) => BookOrder::FULFIL[$w] ?? $w, $this->ways($b))).'.');
        }
        $qty = $fulfil === 'digital' ? 1 : (int) ($in['quantity'] ?? 1);
        if ($qty < 1 || $qty > 50) {
            throw new BooksException('Order between 1 and 50 copies.');
        }
        $address = trim((string) ($in['address'] ?? ''));
        if ($fulfil === 'delivery' && $address === '') {
            throw new BooksException('Enter the address to deliver to.');
        }
        $customer = $buyer->customer ?? throw new BooksException("{$buyer->name} needs a customer account to be invoiced.");
        $hours = (int) CourseSettings::all()['pending_hours'];

        return DB::transaction(function () use ($b, $buyer, $customer, $fulfil, $qty, $address, $in, $by, $channel, $hours) {
            $o = BookOrder::create(['number' => 'BK-'.strtoupper(bin2hex(random_bytes(5))), 'book_id' => $b->id, 'buyer_user_id' => $buyer->id, 'customer_id' => $customer->id, 'quantity' => $qty, 'unit_price' => $b->price, 'fulfil' => $fulfil,
                'address' => $fulfil === 'delivery' ? mb_substr($address, 0, 500) : null, 'phone' => filled($in['phone'] ?? null) ? mb_substr(trim((string) $in['phone']), 0, 40) : $customer->phone, 'status' => 'pending', 'channel' => $channel === 'counter' ? 'counter' : 'online',
                'created_by' => $by?->id, 'expires_at' => $hours > 0 ? now()->addHours($hours) : null]);
            $o->update(['number' => 'BK-'.str_pad((string) $o->id, 6, '0', STR_PAD_LEFT)]);
            $order = $this->vouchers->placeOrder($this->payload($b, $o, $buyer), null);
            $invoice = $this->vouchers->convert($order, VoucherType::SALES, ['moves_stock' => false, 'due_date' => today(config('app.timezone', 'Africa/Nairobi'))->toDateString()], null);
            $o->update(['voucher_id' => $order->id, 'invoice_id' => $invoice->id, 'total' => round((float) $invoice->total_amount, 2)]);

            return $o->fresh();
        });
    }

    // ── money in ──────────────────────────────────────────────────────────

    private function method(array $in): PaymentMethod
    {
        $m = ! empty($in['payment_method_id']) ? PaymentMethod::offeredAtCheckout()->whereKey((int) $in['payment_method_id'])->first() : null;
        if (! $m) {
            throw new BooksException('Choose how to pay.');
        }
        if (! GatewayPaymentService::isAutomatic($m)) {
            throw new BooksException("{$m->name} can't be charged automatically: choose M-Pesa or a card.");
        }

        return $m;
    }

    /** @return array{attempt: array, redirect_url: ?string, message: string} */
    public function pay(BookOrder $o, array $in, ?User $user = null): array
    {
        if ($o->status !== 'pending' || ! $o->invoice_id) {
            throw new BooksException('There is nothing to pay on this order.');
        }
        $m = $this->method($in);
        $buyer = User::find($o->buyer_user_id);
        $r = $this->gateway->start(Voucher::findOrFail($o->invoice_id), $m, ['phone' => $in['phone'] ?? $o->phone, 'email' => $buyer?->email, 'name' => $buyer?->name], [], $o->balance(), $user);
        $a = $r['attempt'];

        return ['attempt' => ['id' => $a->id, 'status' => $a->status, 'amount' => (float) $a->amount, 'gateway' => $a->gateway, 'token' => GatewayPaymentService::returnToken((int) $a->id)], 'redirect_url' => $r['redirect_url'] ?? null,
            'message' => ($r['redirect_url'] ? 'Taking you to the secure payment page' : 'Check your phone and enter your M-Pesa PIN').' to pay '.number_format($o->balance(), 2).'.'];
    }

    /** @param array<int, array{payment_method_id: int, amount: float, reference?: ?string}> $tenders */
    public function takePayment(BookOrder $o, array $tenders, ?User $by = null): BookOrder
    {
        if ($o->status !== 'pending' || ! $o->invoice_id) {
            throw new BooksException('Money can be taken for an order that is waiting for payment.');
        }
        $tenders = array_map(fn ($t) => ['payment_method_id' => (int) $t['payment_method_id'], 'amount' => round((float) ($t['amount'] ?? 0), 2), 'reference' => $t['reference'] ?? null], $tenders);
        $sum = round(array_sum(array_column($tenders, 'amount')), 2);
        if (! $tenders || $sum <= 0) {
            throw new BooksException('Enter the amount received.');
        }
        if ($sum - $o->balance() > 0.009) {
            throw new BooksException('That is more than the '.number_format($o->balance(), 2).' still to pay.');
        }
        DB::transaction(function () use ($o, $tenders, $sum, $by) {
            $this->vouchers->receive(Voucher::findOrFail($o->invoice_id), ['tenders' => $tenders, 'amount' => $sum, 'payment_method_id' => $tenders[0]['payment_method_id'], 'channel' => 'admin'], $by);
            $this->received($o, $sum);
        });

        return $o->fresh();
    }

    /** A receipt reached the invoice (called by the payment service). Safe to call for any invoice. */
    public function paid(Voucher $invoice, float $amount): void
    {
        if (empty($invoice->meta['course_book_order_id']) || ! self::installed()) {
            return;
        }
        if ($o = BookOrder::where('invoice_id', $invoice->id)->first()) {
            $this->received($o, $amount);
        }
    }

    private function received(BookOrder $o, float $amount): void
    {
        $o = DB::transaction(function () use ($o, $amount) {
            $o = BookOrder::whereKey($o->id)->lockForUpdate()->firstOrFail();
            $o->paid_total = round((float) $o->paid_total + $amount, 2);
            $o->expires_at = null;
            if ($o->status === 'pending' && $o->balance() <= 0.009) {
                $o->status = 'paid';
            }
            $o->save();

            return $o;
        });
        if ($o->status === 'paid' && $o->fulfil === 'digital') {
            $o->update(['status' => 'fulfilled', 'delivered_at' => now()]);   // a digital book is delivered the moment it is paid
        }
    }

    // ── delivery, ending ──────────────────────────────────────────────────

    /** A printed copy is handed over or sent: it leaves stock (a delivery note on the Sales Order). A shortage is noted for staff and never stops the delivery. */
    public function deliver(BookOrder $o, ?User $by = null): BookOrder
    {
        if ($o->status !== 'paid' || $o->fulfil === 'digital') {
            throw new BooksException('Only a paid order for a printed copy is delivered by hand.');
        }
        $note = null;
        if (Book::whereKey($o->book_id)->value('stock_variant_id') && $o->voucher_id) {
            try {
                $this->vouchers->convert(Voucher::findOrFail($o->voucher_id), VoucherType::DELIVERY_NOTE, ['reference_no' => $o->number], $by);
            } catch (\Throwable $e) {
                $note = 'Stock was not taken: '.mb_substr($e->getMessage(), 0, 250);
                report($e);
            }
        }
        $o->update(['status' => 'fulfilled', 'delivered_at' => now(), 'stock_note' => $note]);

        return $o->fresh();
    }

    public function cancel(BookOrder $o, ?string $reason = null, ?User $by = null): BookOrder
    {
        if ($o->status !== 'pending') {
            throw new BooksException('Only an order waiting for payment can be cancelled.');
        }
        if ((float) $o->paid_total > 0.004) {
            throw new BooksException('Money has been paid on this: refund it instead.');
        }
        $reason = trim((string) $reason) === '' ? null : mb_substr(trim((string) $reason), 0, 300);
        DB::transaction(function () use ($o, $reason, $by) {
            foreach ([$o->invoice_id, $o->voucher_id] as $id) {
                $v = $id ? Voucher::find($id) : null;
                if ($v && $v->status !== Voucher::CANCELLED) {
                    $this->vouchers->cancel($v, "Book order {$o->number} cancelled".($reason ? ": {$reason}" : ''), $by);
                }
            }
            $o->update(['status' => 'cancelled', 'cancelled_at' => now(), 'cancel_reason' => $reason, 'expires_at' => null]);
        });

        return $o->fresh();
    }

    /** A paid order is refunded: a credit note for the whole sale. The buyer's download stops. */
    public function refund(BookOrder $o, ?User $by = null, ?string $reason = null, ?int $refundLedgerId = null): BookOrder
    {
        if (! in_array($o->status, ['paid', 'fulfilled'], true) || ! $o->invoice_id) {
            throw new BooksException('Only a paid order can be refunded.');
        }
        $invoice = Voucher::with('type')->findOrFail($o->invoice_id);
        $ret = $this->vouchers->returnable($invoice);
        $take = [];
        foreach ($ret['lines'] as $row) {
            if (($row['available_quantity'] ?? 0) < 0.0001) {
                throw new BooksException('Part of this has been credited already: finish it in the books.');
            }
            $take[] = ['item_id' => $row['id'], 'mode' => 'return', 'quantity' => (float) $row['available_quantity']];
        }
        if (! $take) {
            throw new BooksException('The invoice has nothing left to give back.');
        }
        $opts = ['lines' => $take, 'reason' => trim((string) $reason) ?: 'Book refunded', 'narration' => "Book order {$o->number} refunded"];
        if ($this->vouchers->paidAtOnce($invoice)) {
            $opts['refund_ledger_id'] = $refundLedgerId ?: ($ret['refund']['default_id'] ?? null) ?: throw new BooksException('Choose where the refund is paid from.');
        }
        DB::transaction(function () use ($o, $opts, $by) {
            $credit = $this->vouchers->createReturn(Voucher::findOrFail($o->invoice_id), $opts, $by);
            $o->update(['status' => 'refunded', 'credit_note_id' => $credit->id]);
        });

        return $o->fresh();
    }

    /** Unpaid orders let go after the pending time (run by the hourly sweep). @return int */
    public function sweep(?Carbon $now = null): int
    {
        if (! self::installed()) {
            return 0;
        }
        $n = 0;
        foreach (BookOrder::where('status', 'pending')->whereNotNull('expires_at')->where('expires_at', '<', $now ?? now())->where('paid_total', '<=', 0)->get() as $o) {
            try {
                $this->cancel($o, 'Not paid in time.');
                $n++;
            } catch (\Throwable $e) {
                report($e);
            }
        }

        return $n;
    }

    // ── downloads ─────────────────────────────────────────────────────────

    /** May this person download the digital book of this order now? Returns the reason it can not be, or null. */
    public function downloadProblem(BookOrder $o, User $u): ?string
    {
        $b = Book::find($o->book_id);
        if ((int) $o->buyer_user_id !== (int) $u->id || ! $b) {
            return 'This is not your order.';
        }
        if (! in_array($o->status, ['fulfilled', 'paid'], true) || $o->fulfil !== 'digital' || ! $b->file_id) {
            return 'There is nothing to download on this order.';
        }
        if ($b->download_limit > 0 && $o->downloads >= $b->download_limit) {
            return 'You have used all '.$b->download_limit.' downloads. Ask us if you need another.';
        }

        return null;
    }

    public function downloadLink(BookOrder $o, User $u): string
    {
        return URL::temporarySignedRoute('courses.book.download', now()->addMinutes((int) CourseSettings::all()['download_minutes']), ['order' => $o->id, 'u' => $u->id]);
    }

    public function recordDownload(BookOrder $o, User $u, ?string $ip): CourseFile
    {
        $f = CourseFile::findOrFail(Book::whereKey($o->book_id)->value('file_id'));
        $o->increment('downloads');
        $this->files->record($f, $u, $ip, null);

        return $f;
    }

    // ── what the screens show ─────────────────────────────────────────────

    /** @return array<string, mixed> */
    public function row(BookOrder $o, bool $staff = true): array
    {
        $b = Book::find($o->book_id);
        $u = User::find($o->buyer_user_id);

        return ['id' => $o->id, 'number' => $o->number, 'book_id' => $o->book_id, 'book' => $b?->title, 'buyer_user_id' => $o->buyer_user_id, 'buyer' => $u?->name, 'quantity' => $o->quantity, 'fulfil' => $o->fulfil, 'fulfil_label' => BookOrder::FULFIL[$o->fulfil] ?? $o->fulfil,
            'address' => $o->address, 'phone' => $o->phone, 'status' => $o->status, 'status_label' => BookOrder::STATUSES[$o->status] ?? $o->status, 'total' => (float) $o->total, 'paid_total' => (float) $o->paid_total, 'balance' => $o->balance(),
            'downloads' => $o->downloads, 'download_limit' => $b?->download_limit, 'delivered_at' => $o->delivered_at?->toIso8601String(), 'stock_note' => $staff ? $o->stock_note : null, 'channel' => $o->channel, 'cancel_reason' => $o->cancel_reason,
            'can_download' => $u ? $this->downloadProblem($o, $u) === null : false, 'created_at' => $o->created_at?->toIso8601String()];
    }
}
