<?php

namespace App\Console\Commands;

use App\Models\Books\Ledger;
use App\Models\Books\PaymentAttempt;
use App\Models\Books\PaymentMethod;
use App\Models\Books\Voucher;
use App\Models\Currency;
use App\Models\Events\Event;
use App\Models\Events\EventRefundRequest;
use App\Models\Events\EventSession;
use App\Models\Events\EventTicket;
use App\Models\Events\EventTicketType;
use App\Models\User;
use App\Services\Books\CheckoutService;
use App\Services\Books\GatewayPaymentService;
use App\Services\Books\SelfCheck\FakeDaraja;
use App\Services\Books\VoucherService;
use App\Services\DarajaService;
use App\Services\Events\CheckIn;
use App\Services\Events\EventBoxOffice;
use App\Services\Events\EventCheckout;
use App\Services\Events\EventEditor;
use App\Services\Events\EventRefunds;
use App\Services\Events\TicketCodes;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;

/**
 * Runs a real ticket sale through the real books of THIS database, with a pretend M-Pesa, and then undoes everything: the order for the tickets, the payment turning it into a Cash Sale, the
 * tickets becoming valid, the door, a refund written as a credit note for one ticket, a sale at the box office, and a cancelled event refunded in one go. Nothing is saved, no message is sent
 * and no M-Pesa prompt goes out. (Voucher numbers may skip a few: the database does not give those back.)
 */
class EventsSelfCheck extends Command
{
    protected $signature = 'events:selfcheck
        {--income= : id of the income account (ledger) ticket sales are booked to}
        {--till= : id of a cash or bank account (ledger) the box office takes money into and refunds are paid from}
        {--method= : payment method id (an automatic M-Pesa method); the first one offered at checkout when left out}
        {--user= : id of a staff user to act as (the first user when left out)}';

    protected $description = 'Sell, pay, scan, refund and cancel tickets through the real books, with a pretend M-Pesa, then undo it all';

    /** @var array<int, array{0: bool, 1: string}> */
    private array $checks = [];

    private function check(bool $ok, string $what): bool
    {
        $this->checks[] = [$ok, $what];
        $this->line(($ok ? '  <info>PASS</info> ' : '  <error>FAIL</error> ') . $what);

        return $ok;
    }

    public function handle(): int
    {
        $income = $this->option('income') ? Ledger::find((int) $this->option('income')) : null;
        $till = $this->option('till') ? Ledger::find((int) $this->option('till')) : null;
        if (! $income || ! $till) {
            $this->error('Give --income (the income ledger tickets are booked to) and --till (a cash or bank ledger).');

            return self::INVALID;
        }
        $user = $this->option('user') ? User::find((int) $this->option('user')) : User::query()->orderBy('id')->first();
        $method = $this->option('method') ? PaymentMethod::find((int) $this->option('method')) : PaymentMethod::offeredAtCheckout()->where('gateway', 'mpesa_stk')->first();
        if (! $user) {
            $this->error('There is no user to act as (give --user).');

            return self::INVALID;
        }
        if (! $method || $method->gateway !== 'mpesa_stk') {
            $this->error('No automatic M-Pesa payment method found (give --method).');

            return self::INVALID;
        }

        // nothing leaves the server: no queue jobs, no mail, no web requests, and the M-Pesa API is a stand-in
        Queue::fake();
        Mail::fake();
        Http::fake();
        app()->instance(DarajaService::class, new FakeDaraja);
        foreach ([GatewayPaymentService::class, CheckoutService::class, EventCheckout::class, EventBoxOffice::class, EventRefunds::class] as $abstract) {
            app()->forgetInstance($abstract);
        }

        $level = DB::transactionLevel();
        DB::beginTransaction();
        try {
            $this->run2($income, $till, $user, $method);
        } catch (\Throwable $e) {
            $this->check(false, 'the sale ran without an error: ' . $e->getMessage() . ' (' . basename($e->getFile()) . ':' . $e->getLine() . ')');
        } finally {
            while (DB::transactionLevel() > $level) {
                DB::rollBack();
            }
        }
        $failed = count(array_filter($this->checks, fn ($c) => ! $c[0]));
        $this->newLine();
        $this->line('Everything was undone: nothing was saved.');
        $failed ? $this->error("{$failed} check(s) failed.") : $this->info('All ' . count($this->checks) . ' checks passed.');

        return $failed ? self::FAILURE : self::SUCCESS;
    }

    private function run2(Ledger $income, Ledger $till, User $staff, PaymentMethod $method): void
    {
        $currency = Currency::where('is_base', true)->first() ?? Currency::query()->first();
        $event = Event::create(['title' => 'Self-check concert', 'status' => Event::PUBLISHED, 'kind' => 'in_person', 'venue_name' => 'Self-check hall', 'currency_id' => $currency->id, 'sales_ledger_id' => $income->id, 'max_per_order' => 10, 'allow_name_change' => true]);
        EventSession::create(['event_id' => $event->id, 'label' => 'Night', 'starts_at' => now()->addDays(5), 'ends_at' => now()->addDays(5)->addHours(3)]);
        $general = EventTicketType::create(['event_id' => $event->id, 'name' => 'General', 'price' => 1000, 'capacity' => 6]);
        $rsvp = EventTicketType::create(['event_id' => $event->id, 'name' => 'RSVP', 'price' => 0]);
        $checkout = app(EventCheckout::class);
        $buy = [['ticket_type_id' => $general->id, 'quantity' => 2], ['ticket_type_id' => $rsvp->id, 'quantity' => 1]];

        $this->line('Pricing three tickets (two paid, one free)');
        $quote = $checkout->quote($event, $buy);
        $this->check(! $quote['free'] && abs($quote['subtotal'] - 2000.0) < 0.01, "the paid part is 2,000 before tax (the books say {$quote['subtotal']}, tax {$quote['tax_total']}, total {$quote['total']})");
        $this->check(abs($quote['total'] - ($quote['subtotal'] + $quote['tax_total'])) < 0.01, 'total = subtotal + tax');

        $this->line('Placing the order (a guest, paying by M-Pesa)');
        $r = $checkout->place($event, $buy, ['name' => 'Self Check', 'email' => 'selfcheck@example.com', 'phone' => '0700000000'], null, $method);
        $order = Voucher::with('type')->find($r['order']['id'] ?? 0);
        $this->check($r['status'] === 'awaiting_payment' && $order && $order->type?->base_type === 'sales_order', 'a Sales Order was placed' . ($order ? " ({$order->voucher_number})" : ''));
        $this->check(count($r['tickets']) === 3 && collect($r['tickets'])->every(fn ($t) => $t['state'] === 'held'), 'the three tickets are held, not yet valid');
        $this->check($order && abs((float) $order->total_amount - (float) $quote['total']) < 0.01, "the order total is what was quoted ({$order?->total_amount})");
        $order->load('items');
        $this->check($order->items->where('item_type', 'custom')->count() === 1 && (int) $order->items->firstWhere('item_type', 'custom')->ledger_id === (int) $income->id, 'one income line, on the account chosen (free tickets are not on the order)');
        $attempt = PaymentAttempt::find($r['attempt']['id'] ?? 0);
        $this->check($attempt && abs((float) $attempt->amount - (float) $order->total_amount) < 0.01, 'the M-Pesa prompt asks for the whole total');

        $this->line('M-Pesa confirms the payment');
        $raw = ['Body' => ['stkCallback' => ['MerchantRequestID' => $attempt->merchant_request_id, 'CheckoutRequestID' => $attempt->checkout_request_id, 'ResultCode' => 0, 'ResultDesc' => 'The service request is processed successfully.',
            'CallbackMetadata' => ['Item' => [['Name' => 'Amount', 'Value' => (float) $attempt->gateway_amount], ['Name' => 'MpesaReceiptNumber', 'Value' => 'SELFCHECKEV1'], ['Name' => 'PhoneNumber', 'Value' => 254700000000]]]]]];
        $this->check(app(GatewayPaymentService::class)->handleCallback(app(DarajaService::class)->parseCallback($raw), $raw) === true, 'the callback was accepted');
        $attempt->refresh();
        $this->check($attempt->status === PaymentAttempt::CONFIRMED && ! str_contains((string) $attempt->notes, 'could not'), 'the payment is confirmed with no problem noted' . ($attempt->notes ? " (notes: {$attempt->notes})" : ''));
        $sale = $order->children()->with('type')->where('status', Voucher::POSTED)->first();
        $this->check($sale && $sale->type?->base_type === 'cash_sale' && abs((float) $sale->total_amount - (float) $order->total_amount) < 0.01, 'the order became a posted Cash Sale for the same total' . ($sale ? " ({$sale->voucher_number})" : ''));
        $tickets = EventTicket::where('event_id', $event->id)->orderBy('id')->get();
        $this->check($tickets->every(fn ($t) => $t->state === 'valid') && $tickets->where('price', '>', 0)->every(fn ($t) => (int) $t->sale_id === (int) ($sale->id ?? 0)), 'all three tickets are valid and the paid ones point at the sale');

        $this->line('The door');
        $paid = $tickets->where('price', '>', 0)->values();
        $door = app(CheckIn::class);
        $this->check($door->scan($event, TicketCodes::url($paid[0]), null, $staff->id)['result'] === 'ok', 'a ticket\'s QR lets the holder in');
        $this->check($door->scan($event, TicketCodes::code($paid[0]), null, $staff->id)['result'] === 'already', 'the same ticket again is refused');
        $this->check($door->scan($event, 'tk.NOTAREAL.CODE', null, $staff->id)['result'] === 'not_found', 'a made-up code is refused');

        $this->line('Refunding one paid ticket');
        $refunds = app(EventRefunds::class);
        $el = $refunds->eligibility($paid[1], $event->fresh());
        $this->check($el['can_request'] === true, 'the holder may ask for a refund');
        $refunds->request($paid[1], 'Self-check');
        $req = EventRefundRequest::where('ticket_id', $paid[1]->id)->first();
        $this->check($req && $req->status === 'pending', 'a request is waiting for staff');
        $listed = collect($refunds->list())->firstWhere('id', $req->id);
        $this->check(! empty($listed['refund']['ledgers']) && ! $listed['blocked'], 'staff are shown the accounts the money can go back from' . (empty($listed['refund']['ledgers']) ? '' : ' (' . count($listed['refund']['ledgers']) . ')'));
        $credit = $refunds->approve($req, (int) $till->id, 'Self-check', $staff);
        $half = round((float) $sale->total_amount / 2, 2);
        $this->check($credit && $credit->type?->base_type === 'credit_note', 'a credit note was written' . ($credit ? " ({$credit->voucher_number})" : ''));
        $this->check($credit && abs((float) $credit->total_amount - $half) < 0.02, "it is for one of the two paid tickets, with its tax ({$credit?->total_amount} of {$sale->total_amount})");
        $this->check($paid[1]->fresh()->state === 'cancelled' && $req->fresh()->status === 'approved', 'the ticket is cancelled and the request approved');
        $ret = app(VoucherService::class)->returnable($sale->fresh());
        $line = collect($ret['lines'])->firstWhere('item_type', 'custom');
        $this->check($line && abs($line['available_quantity'] - 1.0) < 0.001, 'the sale shows one ticket left to give back (not two)');
        $this->check($door->scan($event, TicketCodes::url($paid[1]), null, $staff->id)['result'] === 'not_valid', 'the refunded ticket no longer opens the door');

        $this->line('Selling one at the box office for cash');
        $box = app(EventBoxOffice::class)->sell($event, [['ticket_type_id' => $general->id, 'quantity' => 1]], ['name' => 'Walk-in'], $staff, 'cash', (int) $till->id);
        $boxSale = Voucher::with('type')->find($box['order']['id'] ?? 0)?->children()->with('type')->where('status', Voucher::POSTED)->first();
        $this->check($box['status'] === 'issued' && $boxSale && $boxSale->type?->base_type === 'cash_sale', 'a posted Cash Sale was made and the ticket is valid');

        $this->line('Complimentary ticket');
        $comp = app(EventBoxOffice::class)->sell($event, [['ticket_type_id' => $general->id, 'quantity' => 1]], ['name' => 'Guest of the artist'], $staff, 'comp', null);
        $this->check($comp['status'] === 'issued' && $comp['tickets'][0]['price'] === 0.0, 'a complimentary ticket costs nothing and is valid');

        $this->line('Cancelling the event');
        app(EventEditor::class)->cancel($event->fresh(), $staff->id);
        $waiting = EventRefundRequest::where('event_id', $event->id)->where('status', 'pending')->count();
        $this->check($waiting === 2, "a refund is waiting for each of the two paid tickets still valid ({$waiting}): the first holder's, and the box office one");
        $this->check(EventTicket::where('event_id', $event->id)->where('price', '<=', 0)->where('state', 'valid')->count() === 0, 'free and complimentary tickets simply end');
        $all = $refunds->approveAll($event->fresh(), (int) $till->id, $staff);
        $this->check($all['done'] === 2 && $all['failed'] === [], "both were refunded in one go (done {$all['done']}" . ($all['failed'] ? ', problem: ' . json_encode($all['failed']) : '') . ')');
    }
}
