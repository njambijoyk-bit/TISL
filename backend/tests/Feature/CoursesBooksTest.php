<?php

namespace Tests\Feature;

use App\Models\Books\Voucher;
use App\Models\Courses\Book;
use App\Models\Courses\BookOrder;
use App\Models\Courses\CourseFile;
use App\Services\Books\BooksException;
use App\Services\Courses\BookLibrary;
use App\Services\Courses\BookSales;
use App\Services\Courses\CourseSettings;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Courses step 5: the books library and selling books through the books (orders, payment, delivery, downloads, cancel, refund). "Now" is Monday 12 Oct 2026, 12:00. */
class CoursesBooksTest extends TestCase
{
    use Concerns\CreatesCoursesWorld;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createCoursesWorld();
    }

    private function fails(callable $fn, string $msg): void
    {
        try {
            $fn();
            $this->fail("Expected: {$msg}");
        } catch (BooksException $e) {
            $this->assertStringContainsString($msg, $e->getMessage());
        }
    }

    private function lib(): BookLibrary
    {
        return app(BookLibrary::class);
    }

    private function sales(): BookSales
    {
        return app(BookSales::class);
    }

    private function book(array $d = []): Book
    {
        return $this->lib()->save($d + ['title' => 'The Bread Book', 'price' => 1000, 'ledger_id' => $this->productLedger]);
    }

    private function digital(array $d = []): Book
    {
        $b = $this->book($d + ['format' => 'digital']);

        return $this->lib()->attach($b, 'file', UploadedFile::fake()->createWithContent('bread.pdf', '%PDF-book'));
    }

    // ── the library ──────────────────────────────────────────────────────

    public function test_a_book_is_saved_with_tidy_fields_and_a_unique_slug(): void
    {
        $b = $this->book(['authors' => '  Ann Baker ', 'isbn' => '978-0-306-40615-7', 'description' => '', 'stock_variant_id' => 13, 'download_limit' => 0, 'sort_order' => 3], );
        $this->assertSame(['the-bread-book', 'printed', 1000.0, 'Ann Baker', '9780306406157', null, 13, 0, 3, true], [$b->slug, $b->format, (float) $b->price, $b->authors, $b->isbn, $b->description, (int) $b->stock_variant_id, (int) $b->download_limit, (int) $b->sort_order, (bool) $b->is_active]);
        $this->assertSame('the-bread-book-2', $this->book()->slug);
        $this->assertSame(5, (int) $this->book(['title' => 'Other'])->download_limit);   // five downloads unless told
        $edited = $this->lib()->save(['price' => 1200, 'isbn' => '', 'is_active' => false], $b);
        $this->assertSame([1200.0, null, false, 'the-bread-book', 'Ann Baker'], [(float) $edited->price, $edited->isbn, (bool) $edited->is_active, $edited->slug, $edited->authors]);
        $this->assertSame('x12345678x', $this->book(['isbn' => 'x-1234-5678-x'])->isbn);   // an X is a check digit
        $this->assertSame(190, mb_strlen($this->book(['title' => str_repeat('b', 190)])->title));
        $this->assertSame('Bread Book Ltd', $this->lib()->save(['ledger_id' => $this->serviceLedger, 'authors' => 'Bread Book Ltd'], $b)->authors);   // a service account is allowed too
    }

    public function test_a_book_is_checked(): void
    {
        $this->fails(fn () => $this->book(['title' => ' ']), 'title of up to 190');
        $this->fails(fn () => $this->book(['title' => str_repeat('b', 191)]), 'title of up to 190');
        $this->fails(fn () => $this->book(['format' => 'audio']), 'printed, digital or both');
        $this->fails(fn () => $this->book(['price' => 0]), 'price of the book');
        $this->fails(fn () => $this->book(['price' => 10000000.01]), 'price of the book');
        $this->assertSame(10000000.0, (float) $this->book(['price' => 10000000])->price);
        $this->assertSame(0.01, (float) $this->book(['price' => 0.01])->price);
        $this->fails(fn () => $this->lib()->save(['title' => 'X', 'price' => 10]), 'sales account the book is booked under');
        $exp = DB::table('ledgers')->insertGetId(['name' => 'Rent', 'group_id' => DB::table('ledger_groups')->insertGetId(['name' => 'Expenses', 'behaviour' => 'expense']), 'tax_nature' => 'taxable']);
        $this->fails(fn () => $this->book(['ledger_id' => $exp]), 'not a sales account');
        $this->fails(fn () => $this->book(['isbn' => '12345']), '10 or 13 digits');
        $this->fails(fn () => $this->book(['isbn' => '12345678901']), '10 or 13 digits');
        $this->assertSame('1234567890', $this->book(['isbn' => '1-234-56789-0'])->isbn);
        $this->fails(fn () => $this->book(['stock_variant_id' => 99]), 'stock item does not exist');
        $this->fails(fn () => $this->book(['download_limit' => -1]), '0 (no limit) and 100');
        $this->fails(fn () => $this->book(['download_limit' => 101]), '0 (no limit) and 100');
        $this->assertSame(100, (int) $this->book(['download_limit' => 100])->download_limit);
        $d = $this->digital();
        $this->fails(fn () => $this->lib()->save(['format' => 'printed'], $d), 'Remove the digital file first');
        $this->assertSame('both', $this->lib()->save(['format' => 'both'], $d)->format);
    }

    public function test_files_and_samples_replace_the_old_one_and_a_printed_book_has_no_file(): void
    {
        $p = $this->book();
        $this->fails(fn () => $this->lib()->attach($p, 'file', UploadedFile::fake()->create('x.pdf', 1)), 'Make the book digital');
        $this->fails(fn () => $this->lib()->attach($p, 'cover', UploadedFile::fake()->create('x.pdf', 1)), 'file or the sample');
        $p = $this->lib()->attach($p, 'sample', UploadedFile::fake()->create('sample.pdf', 1));   // a printed book can still have a free sample
        $first = CourseFile::findOrFail($p->sample_file_id);
        $this->assertNull($first->offering_id);
        $p = $this->lib()->attach($p, 'sample', UploadedFile::fake()->create('sample2.pdf', 1));
        $this->assertNull(CourseFile::find($first->id));   // the old one is gone, from the table and the disk
        Storage::disk('local')->assertMissing($first->path);
        $p = $this->lib()->detach($p, 'sample');
        $this->assertSame([null, 0], [$p->sample_file_id, CourseFile::count()]);
        $this->assertSame(null, $this->lib()->detach($p, 'file')->file_id);   // nothing there: nothing happens
    }

    public function test_a_sold_book_is_switched_off_not_deleted_and_an_unsold_one_goes_with_its_files(): void
    {
        $d = $this->digital();
        $o = $this->offering();
        $this->lib()->setForOffering($o, [['book_id' => $d->id, 'relation' => 'required']]);
        $this->lib()->delete($d);
        $this->assertSame([0, 0, 0], [Book::count(), CourseFile::count(), DB::table('course_offering_books')->count()]);
        $sold = $this->book();
        $this->sales()->order($sold, $this->person(), ['fulfil' => 'pickup']);
        $this->fails(fn () => $this->lib()->delete($sold), 'switch it off instead');
    }

    public function test_a_course_lists_its_required_books_first_and_only_those_on_sale(): void
    {
        $o = $this->offering();
        $a = $this->book(['title' => 'Zebra cakes']);
        $b = $this->book(['title' => 'Apple pies']);
        $c = $this->book(['title' => 'Hidden', 'is_active' => false]);
        $this->fails(fn () => $this->lib()->setForOffering($o, [['book_id' => $a->id, 'relation' => 'maybe']]), 'required or recommended');
        $this->fails(fn () => $this->lib()->setForOffering($o, [['book_id' => 999, 'relation' => 'required']]), 'does not exist');
        $this->lib()->setForOffering($o, [['book_id' => $b->id], ['book_id' => $a->id, 'relation' => 'required'], ['book_id' => $c->id, 'relation' => 'required']]);
        $rows = $this->lib()->forOffering($o->id);
        $this->assertSame([['Zebra cakes', 'required'], ['Apple pies', 'recommended']], array_map(fn ($r) => [$r['title'], $r['relation']], $rows));
        $this->assertArrayNotHasKey('ledger_id', $rows[0]);   // the public row
        $this->lib()->setForOffering($o, [['book_id' => $a->id, 'relation' => 'recommended'], ['book_id' => $a->id, 'relation' => 'required']]);   // the last word counts, once
        $this->assertSame([['Zebra cakes', 'required']], array_map(fn ($r) => [$r['title'], $r['relation']], $this->lib()->forOffering($o->id)));
        $this->lib()->setForOffering($o, []);
        $this->assertSame([], $this->lib()->forOffering($o->id));
    }

    public function test_the_staff_row_shows_the_stock_item_and_how_many_were_sold(): void
    {
        $b = $this->book(['stock_variant_id' => 13]);
        $u = $this->person();
        $paid = $this->sales()->order($b, $u, ['fulfil' => 'pickup', 'quantity' => 3]);
        $this->sales()->takePayment($paid, [['payment_method_id' => 1, 'amount' => $paid->total]]);
        $this->sales()->order($b, $u, ['fulfil' => 'pickup', 'quantity' => 2]);   // not paid: not sold
        $row = $this->lib()->row($b->fresh(), true);
        $this->assertSame(['The Bread Book (printed)', 3, null, null], [$row['stock_item'], $row['sold'], $row['file'], $row['sample']]);
    }

    // ── ordering ─────────────────────────────────────────────────────────

    public function test_ways_to_get_a_book_follow_its_format(): void
    {
        $this->assertSame(['delivery', 'pickup'], $this->sales()->ways($this->book()));
        $this->assertSame([], $this->sales()->ways($this->book(['format' => 'digital'])));   // digital without its file yet: not on sale that way
        $this->assertSame(['digital'], $this->sales()->ways($this->digital()));
        $this->assertSame(['digital', 'delivery', 'pickup'], $this->sales()->ways($this->digital(['format' => 'both'])));
    }

    public function test_an_order_books_an_invoice_with_a_stock_line_or_a_sales_line(): void
    {
        $printed = $this->book(['title' => 'Bread', 'stock_variant_id' => 13, 'price' => 500]);
        $u = $this->person('Amina', true, '0711');
        $o = $this->sales()->order($printed, $u, ['fulfil' => 'delivery', 'quantity' => 2, 'address' => '  12 Mill Road ']);
        $this->assertSame(['BK-'.str_pad((string) $o->id, 6, '0', STR_PAD_LEFT), 'pending', 2, '12 Mill Road', '0711', 1160.0, 'online'], [$o->number, $o->status, (int) $o->quantity, $o->address, $o->phone, (float) $o->total, $o->channel]);
        $this->assertSame('2026-10-14 12:00', $o->expires_at->timezone('Africa/Nairobi')->format('Y-m-d H:i'));
        $this->assertSame(['type' => 'product', 'product_id' => 3, 'variant_id' => 13, 'quantity' => 2.0, 'rate' => 500.0, 'location_id' => 1], $this->placed[0]['lines'][0]);
        $this->assertSame([$o->id, 'Book order '.$o->number.': Bread'], [$this->placed[0]['meta']['course_book_order_id'], $this->placed[0]['narration']]);
        $this->assertSame([false], [$this->invoices[0]['moves_stock']]);   // stock leaves on delivery, not on the invoice
        $d = $this->digital(['title' => 'E-bread', 'stock_variant_id' => 13]);
        $this->sales()->order($d, $u, ['fulfil' => 'digital', 'quantity' => 9, 'phone' => ' 0722 ']);
        $line = $this->placed[1]['lines'][0];
        $this->assertSame(['custom', 'E-bread (digital)', 1.0, (int) $this->productLedger], [$line['type'], $line['description'], $line['quantity'], $line['ledger_id']]);   // one copy of a file; never stock
        $this->assertSame('0722', BookOrder::latest('id')->value('phone'));
        $plain = $this->book(['title' => 'No stock']);
        $this->sales()->order($plain, $u, ['fulfil' => 'pickup']);
        $this->assertSame(['custom', 'No stock'], [$this->placed[2]['lines'][0]['type'], $this->placed[2]['lines'][0]['description']]);
        $clerk = $this->person('Clerk', false);
        $c = $this->sales()->order($plain, $u, ['fulfil' => 'pickup'], $clerk, 'counter');
        $this->assertSame(['counter', (int) $clerk->id], [$c->channel, (int) $c->created_by]);
    }

    public function test_an_order_is_checked(): void
    {
        $b = $this->book();
        $u = $this->person();
        $this->fails(fn () => $this->sales()->order($b, $u, ['fulfil' => 'digital']), 'Choose how you want it: Delivery, Collect');
        $this->fails(fn () => $this->sales()->order($b, $u, ['fulfil' => 'pickup', 'quantity' => 0]), 'between 1 and 50');
        $this->fails(fn () => $this->sales()->order($b, $u, ['fulfil' => 'pickup', 'quantity' => 51]), 'between 1 and 50');
        $this->assertSame(50, (int) $this->sales()->order($b, $u, ['fulfil' => 'pickup', 'quantity' => 50])->quantity);
        $this->fails(fn () => $this->sales()->order($b, $u, ['fulfil' => 'delivery', 'address' => '  ']), 'address to deliver to');
        $this->assertNull($this->sales()->order($b, $u, ['fulfil' => 'pickup', 'address' => 'Ignored'])->address);
        $this->fails(fn () => $this->sales()->order($b, $this->person('NoAccount', false), ['fulfil' => 'pickup']), 'NoAccount needs a customer account');
        $off = $this->book(['is_active' => false]);
        $this->fails(fn () => $this->sales()->order($off, $u, ['fulfil' => 'pickup']), 'not on sale');
        CourseSettings::save(['pending_hours' => 0], null);
        $this->assertNull($this->sales()->order($b, $u, ['fulfil' => 'pickup'])->expires_at);
    }

    public function test_a_quote_shows_the_total_with_tax(): void
    {
        $b = $this->book(['price' => 500]);
        $u = $this->person();
        $this->assertSame(['unit_price' => 500.0, 'quantity' => 3, 'subtotal' => 1500.0, 'total' => 1740.0, 'ways' => ['delivery', 'pickup']], $this->sales()->quote($b, 3, $u));
        $this->assertSame(50, $this->sales()->quote($b, 80, $u)['quantity']);
        $this->assertSame(1, $this->sales()->quote($b, -2, $u)['quantity']);
        $this->assertSame(1, $this->sales()->quote($this->digital(), 4, $u)['quantity']);   // one copy of a file
        $this->assertSame([], $this->placed);
    }

    // ── paying, delivering ───────────────────────────────────────────────

    public function test_a_digital_book_is_delivered_the_moment_it_is_paid(): void
    {
        $b = $this->digital();
        $u = $this->person();
        $o = $this->sales()->order($b, $u, ['fulfil' => 'digital']);
        $this->assertSame('There is nothing to download on this order.', $this->sales()->downloadProblem($o, $u));
        $o = $this->sales()->takePayment($o, [['payment_method_id' => 1, 'amount' => 500]]);
        $this->assertSame(['pending', 500.0, null], [$o->status, (float) $o->paid_total, $o->expires_at]);
        $this->fails(fn () => $this->sales()->takePayment($o, [['payment_method_id' => 1, 'amount' => 660.01]]), 'more than the 660.00');
        $this->fails(fn () => $this->sales()->takePayment($o, [['payment_method_id' => 1, 'amount' => 0]]), 'Enter the amount');
        $o = $this->sales()->takePayment($o, [['payment_method_id' => 1, 'amount' => 660]]);
        $this->assertSame('fulfilled', $o->status);
        $this->assertNotNull($o->delivered_at);
        $this->assertNull($this->sales()->downloadProblem($o, $u));
        $this->assertTrue($this->sales()->row($o)['can_download']);
        $this->assertFalse($this->sales()->row($this->sales()->order($b, $u, ['fulfil' => 'digital']))['can_download']);   // not paid yet
        $this->assertSame('This is not your order.', $this->sales()->downloadProblem($o, $this->person('Other')));
        $this->fails(fn () => $this->sales()->takePayment($o, [['payment_method_id' => 1, 'amount' => 1]]), 'waiting for payment');
        $this->fails(fn () => $this->sales()->deliver($o), 'printed copy');
    }

    public function test_a_gateway_payment_reaches_the_order_through_its_invoice(): void
    {
        $o = $this->sales()->order($this->book(), $this->person(), ['fulfil' => 'pickup']);
        $this->sales()->paid(Voucher::create(['voucher_type_id' => 2, 'meta' => ['x' => 1]]), 1160);
        $this->sales()->paid(Voucher::create(['voucher_type_id' => 2, 'meta' => ['course_book_order_id' => 999]]), 1160);
        $this->assertSame(0.0, (float) $o->fresh()->paid_total);
        $this->sales()->paid(Voucher::find($o->invoice_id), 1160);
        $this->assertSame('paid', $o->fresh()->status);   // printed: paid, then delivered by hand
    }

    public function test_an_online_payment_starts_on_the_gateway_for_the_balance(): void
    {
        $o = $this->sales()->order($this->book(), $this->person('Amina', true, '0711'), ['fulfil' => 'pickup']);
        $this->sales()->takePayment($o, [['payment_method_id' => 1, 'amount' => 160]]);
        $r = $this->sales()->pay($o->fresh(), ['payment_method_id' => 4]);
        $this->assertSame(['invoice' => (int) $o->invoice_id, 'method' => 'M-Pesa online', 'amount' => 1000.0, 'phone' => '0711'], $this->started[0]);
        $this->assertSame('Check your phone and enter your M-Pesa PIN to pay 1,000.00.', $r['message']);
        $this->sales()->pay($o->fresh(), ['payment_method_id' => 4, 'phone' => '0799']);
        $this->assertSame('0799', $this->started[1]['phone']);
        $this->fails(fn () => $this->sales()->pay($o->fresh(), ['payment_method_id' => 1]), 'Choose how to pay');
        DB::table('payment_methods')->insert(['id' => 5, 'name' => 'Odd', 'kind' => 'card', 'is_online' => true, 'gateway' => 'no_such_gateway', 'is_active' => true]);
        $this->fails(fn () => $this->sales()->pay($o->fresh(), ['payment_method_id' => 5]), "can't be charged automatically");
        $this->sales()->takePayment($o->fresh(), [['payment_method_id' => 1, 'amount' => 1000]]);
        $this->fails(fn () => $this->sales()->pay($o->fresh(), ['payment_method_id' => 4]), 'nothing to pay');
    }

    public function test_a_printed_copy_leaves_stock_on_delivery_and_a_shortage_never_stops_it(): void
    {
        $b = $this->book(['stock_variant_id' => 13]);
        $u = $this->person();
        $o = $this->sales()->order($b, $u, ['fulfil' => 'pickup']);
        $this->fails(fn () => $this->sales()->deliver($o), 'Only a paid order');
        $o = $this->sales()->takePayment($o, [['payment_method_id' => 1, 'amount' => 1160]]);
        $clerk = $this->person('Clerk', false);
        $o = $this->sales()->deliver($o, $clerk);
        $this->assertSame(['fulfilled', null], [$o->status, $o->stock_note]);
        $this->assertSame([\App\Models\Books\VoucherType::DELIVERY_NOTE, (int) $o->voucher_id, $o->number], [$this->invoices[1]['type'], $this->invoices[1]['order'], $this->invoices[1]['reference_no']]);
        $nostock = $this->book(['title' => 'Plain']);
        $p = $this->sales()->takePayment($this->sales()->order($nostock, $u, ['fulfil' => 'pickup']), [['payment_method_id' => 1, 'amount' => 1160]]);
        $this->sales()->deliver($p);
        $this->assertCount(3, $this->invoices);   // no stock item: no delivery note
        $short = $this->sales()->takePayment($this->sales()->order($b, $u, ['fulfil' => 'pickup']), [['payment_method_id' => 1, 'amount' => 1160]]);
        $v = $this->createMock(\App\Services\Books\VoucherService::class);
        $v->method('convert')->willThrowException(new BooksException('Not enough stock of APR'));
        $this->app->instance(\App\Services\Books\VoucherService::class, $v);
        $short = app(BookSales::class)->deliver($short);
        $this->assertSame(['fulfilled', 'Stock was not taken: Not enough stock of APR'], [$short->status, $short->stock_note]);
        $this->assertSame('Stock was not taken: Not enough stock of APR', app(BookSales::class)->row($short)['stock_note']);
        $this->assertNull(app(BookSales::class)->row($short, false)['stock_note']);
    }

    // ── ending ───────────────────────────────────────────────────────────

    public function test_an_unpaid_order_is_cancelled_with_its_books_and_unpaid_ones_are_let_go(): void
    {
        $b = $this->book();
        $u = $this->person();
        $o = $this->sales()->order($b, $u, ['fulfil' => 'pickup']);
        $o = $this->sales()->cancel($o, '  Wrong book ');
        $this->assertSame(['cancelled', 'Wrong book', null], [$o->status, $o->cancel_reason, $o->expires_at]);
        $this->assertSame([(int) $o->invoice_id, (int) $o->voucher_id], $this->cancelled);
        $this->fails(fn () => $this->sales()->cancel($o), 'waiting for payment');
        $part = $this->sales()->takePayment($this->sales()->order($b, $u, ['fulfil' => 'pickup']), [['payment_method_id' => 1, 'amount' => 10]]);
        $this->fails(fn () => $this->sales()->cancel($part), 'refund it instead');
        $late = $this->sales()->order($b, $u, ['fulfil' => 'pickup']);
        BookOrder::whereKey($part->id)->update(['expires_at' => now()->subHour()]);
        $this->assertSame(0, $this->sales()->sweep(Carbon::parse('2026-10-14 11:59', 'Africa/Nairobi')));
        $this->assertSame(1, $this->sales()->sweep(Carbon::parse('2026-10-14 12:01', 'Africa/Nairobi')));
        $this->assertSame(['cancelled', 'Not paid in time.', 'pending'], [$late->fresh()->status, $late->fresh()->cancel_reason, $part->fresh()->status]);
        $this->assertNull($this->sales()->cancel($this->sales()->order($b, $u, ['fulfil' => 'pickup']), ' ')->cancel_reason);
    }

    public function test_a_paid_order_is_refunded_with_a_credit_note_and_the_download_stops(): void
    {
        $b = $this->digital();
        $u = $this->person();
        $o = $this->sales()->takePayment($this->sales()->order($b, $u, ['fulfil' => 'digital']), [['payment_method_id' => 1, 'amount' => 1160]]);
        $this->fails(fn () => $this->sales()->refund($this->sales()->order($b, $u, ['fulfil' => 'digital'])), 'Only a paid order');
        $o = $this->sales()->refund($o, null, '  ');
        $this->assertSame(['refunded', 'Book refunded', "Book order {$o->number} refunded"], [$o->status, $this->credited[0]['reason'], $this->credited[0]['narration']]);
        $this->assertSame([['item_id' => (int) $o->invoice_id * 100, 'mode' => 'return', 'quantity' => 1.0]], $this->credited[0]['lines']);
        $this->assertNotNull($o->credit_note_id);
        $this->assertSame('There is nothing to download on this order.', $this->sales()->downloadProblem($o, $u));
        $this->fails(fn () => $this->sales()->refund($o), 'Only a paid order');
        $again = $this->sales()->takePayment($this->sales()->order($b, $u, ['fulfil' => 'digital']), [['payment_method_id' => 1, 'amount' => 1160]]);
        $this->credited[] = ['invoice' => (int) $again->invoice_id];
        $this->fails(fn () => $this->sales()->refund($again), 'credited already');
        $nothing = $this->sales()->takePayment($this->sales()->order($b, $u, ['fulfil' => 'digital']), [['payment_method_id' => 1, 'amount' => 1160]]);
        $this->placed = array_values(array_filter($this->placed, fn ($p) => ($p['meta'] ?? null) != Voucher::find($nothing->invoice_id)->meta));   // the books show no lines left on it
        $this->fails(fn () => $this->sales()->refund($nothing), 'nothing left to give back');
        $this->paidAtOnce = true;
        $cash = $this->sales()->takePayment($this->sales()->order($b, $u, ['fulfil' => 'digital']), [['payment_method_id' => 1, 'amount' => 1160]]);
        $this->sales()->refund($cash, null, 'Changed mind', 12);
        $this->assertSame(12, end($this->credited)['refund_ledger_id']);
        $cash2 = $this->sales()->takePayment($this->sales()->order($b, $u, ['fulfil' => 'digital']), [['payment_method_id' => 1, 'amount' => 1160]]);
        $this->sales()->refund($cash2);
        $this->assertSame(9, end($this->credited)['refund_ledger_id']);
    }

    // ── downloads ────────────────────────────────────────────────────────

    public function test_downloads_are_limited_per_buyer_and_counted_only_when_the_file_is_there(): void
    {
        $b = $this->digital(['download_limit' => 2]);
        $u = $this->person();
        $o = $this->sales()->takePayment($this->sales()->order($b, $u, ['fulfil' => 'digital']), [['payment_method_id' => 1, 'amount' => 1160]]);
        Sanctum::actingAs($u, ['*']);
        $url = $this->getJson("/api/courses/book-orders/{$o->id}/link")->assertOk()->json('url');
        $r = $this->get($url)->assertOk();
        $this->assertSame('%PDF-book', $r->streamedContent());
        $this->get($url)->assertOk();
        $this->assertSame(2, (int) $o->fresh()->downloads);
        $this->get($url)->assertForbidden();
        $this->getJson("/api/courses/book-orders/{$o->id}/link")->assertStatus(422)->assertJsonPath('message', 'You have used all 2 downloads. Ask us if you need another.');
        $this->assertSame(2, DB::table('course_downloads')->count());
        $b->update(['download_limit' => 0]);   // no limit
        Storage::disk('local')->delete(CourseFile::find($b->file_id)->path);
        $this->get($url)->assertNotFound();
        $this->assertSame(2, (int) $o->fresh()->downloads);   // a missing file uses nothing up
        $them = $this->person('Them');
        $this->get(str_replace('u='.$u->id, 'u='.$them->id, $url))->assertForbidden();   // the signature covers the person
        Sanctum::actingAs($them, ['*']);
        $this->getJson("/api/courses/book-orders/{$o->id}/link")->assertNotFound();
    }

    // ── the storefront (HTTP) ────────────────────────────────────────────

    public function test_the_storefront_lists_books_on_sale_and_gives_out_the_sample(): void
    {
        $a = $this->book(['title' => 'Alpha', 'authors' => 'Ann', 'sort_order' => 2]);
        $b = $this->digital(['title' => 'Beta', 'isbn' => '1234567890', 'sort_order' => 1]);
        $c = $this->digital(['title' => 'Gamma', 'format' => 'both', 'sort_order' => 3]);
        $this->book(['title' => 'Off', 'is_active' => false]);
        $this->assertSame(['Beta', 'Alpha', 'Gamma'], array_column($this->getJson('/api/learn/books')->assertOk()->json('books'), 'title'));
        $this->assertSame(['Beta', 'Gamma'], array_column($this->getJson('/api/learn/books?format=digital')->json('books'), 'title'));
        $this->assertSame(['Alpha', 'Gamma'], array_column($this->getJson('/api/learn/books?format=printed')->json('books'), 'title'));
        $this->assertSame(['Alpha'], array_column($this->getJson('/api/learn/books?q=ann')->json('books'), 'title'));
        $this->assertSame(['Beta'], array_column($this->getJson('/api/learn/books?q=12345')->json('books'), 'title'));
        $this->assertArrayNotHasKey('ledger_id', $this->getJson('/api/learn/books')->json('books.0'));
        $this->getJson('/api/learn/books/'.$b->slug)->assertOk()->assertJsonPath('book.ways', ['digital'])->assertJsonPath('book.download_limit', 5);
        $this->getJson('/api/learn/books/off')->assertNotFound();
        $this->get("/api/learn/books/{$a->id}/sample")->assertNotFound();
        $this->lib()->attach($a, 'sample', UploadedFile::fake()->createWithContent('s.pdf', '%PDF-sample'));
        $this->assertSame('%PDF-sample', $this->get("/api/learn/books/{$a->id}/sample")->assertOk()->streamedContent());
        $a->update(['is_active' => false]);
        $this->get("/api/learn/books/{$a->id}/sample")->assertNotFound();
        unset($c);
    }

    public function test_a_buyer_orders_pays_and_sees_only_their_own_orders(): void
    {
        $b = $this->book();
        $me = $this->person('Me');
        $theirs = $this->sales()->order($b, $this->person('Them'), ['fulfil' => 'pickup']);
        $this->postJson("/api/courses/books/{$b->id}/buy", ['fulfil' => 'pickup'])->assertUnauthorized();
        Sanctum::actingAs($me, ['*']);
        $q = $this->postJson("/api/courses/books/{$b->id}/quote", ['quantity' => 2])->assertOk()->json();
        $this->assertEquals([2320, ['M-Pesa online']], [$q['total'], array_column($q['payment_methods'], 'name')]);
        $r = $this->postJson("/api/courses/books/{$b->id}/buy", ['fulfil' => 'pickup', 'payment_method_id' => 4])->assertCreated()->json();
        $this->assertSame(['pending', 701], [$r['order']['status'], $r['attempt']['id']]);
        $this->assertNull($r['order']['stock_note']);
        $mine = $r['order']['id'];
        $this->assertSame('Your order is held: pay to confirm it.', $this->postJson("/api/courses/books/{$b->id}/buy", ['fulfil' => 'pickup'])->assertCreated()->json('message'));
        $this->assertSame(2, count($this->getJson('/api/courses/my/books')->assertOk()->json('orders')));
        $this->postJson("/api/courses/book-orders/{$theirs->id}/pay", ['payment_method_id' => 4])->assertNotFound();
        $this->postJson("/api/courses/book-orders/{$mine}/pay", ['payment_method_id' => 4])->assertOk();
        $this->postJson("/api/courses/books/{$b->id}/buy", ['fulfil' => 'teleport'])->assertStatus(422);
        $b->update(['is_active' => false]);
        $this->postJson("/api/courses/books/{$b->id}/buy", ['fulfil' => 'pickup'])->assertNotFound();
    }

    public function test_staff_book_routes_answer_to_their_permission(): void
    {
        $b = $this->book();
        $buyer = $this->person('Buyer');
        Sanctum::actingAs($this->staff('Viewer', ['courses.view']), ['*']);
        $this->getJson('/api/admin/courses/books')->assertForbidden();
        $this->postJson('/api/admin/courses/books', ['title' => 'X', 'price' => 1, 'ledger_id' => $this->productLedger])->assertForbidden();
        Sanctum::actingAs($this->staff('Clerk', ['courses.view', 'courses.enrol']), ['*']);
        $this->getJson('/api/admin/courses/books')->assertOk()->assertJsonPath('books.0.ledger_id', $this->productLedger);
        $this->postJson('/api/admin/courses/books', ['title' => 'X', 'price' => 1, 'ledger_id' => $this->productLedger])->assertForbidden();
        $id = $this->postJson("/api/admin/courses/books/{$b->id}/sell", ['buyer_user_id' => $buyer->id, 'fulfil' => 'pickup'])->assertCreated()->assertJsonPath('order.channel', 'counter')->json('order.id');
        $this->postJson("/api/admin/courses/book-orders/{$id}/payment", ['tenders' => [['payment_method_id' => 1, 'amount' => 1160]]])->assertOk()->assertJsonPath('order.status', 'paid');
        $this->postJson("/api/admin/courses/book-orders/{$id}/deliver")->assertOk()->assertJsonPath('order.status', 'fulfilled');
        $this->postJson("/api/admin/courses/book-orders/{$id}/refund")->assertForbidden();
        $this->sales()->order($b, $this->person('Zed'), ['fulfil' => 'pickup']);
        $this->assertSame([$id], array_column($this->getJson('/api/admin/courses/book-orders?q=buy')->assertOk()->json('orders'), 'id'));
        $this->assertSame(['Zed'], array_column($this->getJson('/api/admin/courses/book-orders?status=pending')->json('orders'), 'buyer'));
        Sanctum::actingAs($this->staff('Boss', ['courses.view', 'courses.refund']), ['*']);
        $this->postJson("/api/admin/courses/books/{$b->id}/sell", ['buyer_user_id' => $buyer->id, 'fulfil' => 'pickup'])->assertForbidden();
        $this->postJson("/api/admin/courses/book-orders/{$id}/refund", ['reason' => 'Torn'])->assertOk()->assertJsonPath('order.status', 'refunded');
        Sanctum::actingAs($this->staff('Manager', ['courses.view', 'courses.manage']), ['*']);
        $new = $this->postJson('/api/admin/courses/books', ['title' => 'New', 'price' => 10, 'ledger_id' => $this->productLedger, 'format' => 'digital'])->assertCreated()->json('book.id');
        $this->post("/api/admin/courses/books/{$new}/files/file", ['file' => UploadedFile::fake()->create('n.pdf', 2)])->assertOk()->assertJsonPath('book.file.name', 'n.pdf');
        $this->post("/api/admin/courses/books/{$new}/files/cover", ['file' => UploadedFile::fake()->create('n.pdf', 2)])->assertNotFound();
        $this->deleteJson("/api/admin/courses/books/{$new}/files/file")->assertOk()->assertJsonPath('book.file', null);
        $o = $this->offering();
        $this->putJson("/api/admin/courses/offerings/{$o->id}/books", ['books' => [['book_id' => $new, 'relation' => 'required']]])->assertOk()->assertJsonPath('books.0.id', $new);
        $this->deleteJson("/api/admin/courses/books/{$b->id}")->assertStatus(422);
        $this->deleteJson("/api/admin/courses/books/{$new}")->assertOk();
    }
}
