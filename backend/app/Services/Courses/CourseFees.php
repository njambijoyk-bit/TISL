<?php

namespace App\Services\Courses;

use App\Models\Courses\Fee;
use App\Models\Courses\Offering;
use App\Services\Books\BooksException;
use App\Services\Books\TradingAccounts;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** The fee lines of an offering. Each is booked under a sales account chosen here; that account decides the tax, as for every sale in the books. */
class CourseFees
{
    public static function installed(): bool
    {
        return Schema::hasTable('course_fees') && Schema::hasTable('course_enrolments') && Schema::hasTable('course_instalments') && Schema::hasColumn('course_offerings', 'capacity');
    }

    /**
     * @param array{kind?: mixed, name?: mixed, ledger_id?: mixed, amount?: mixed, is_optional?: mixed, once_per_student?: mixed, refundable?: mixed, is_active?: mixed, sort_order?: mixed} $d
     */
    public function save(Offering $o, array $d, ?Fee $f = null): Fee
    {
        if ($f && (int) $f->offering_id !== (int) $o->id) {
            throw new BooksException('That fee belongs to another offering.');
        }
        $kind = (string) ($d['kind'] ?? $f?->kind ?? 'tuition');
        if (! isset(Fee::KINDS[$kind])) {
            throw new BooksException('Choose what kind of fee it is.');
        }
        $name = trim((string) ($d['name'] ?? $f?->name ?? Fee::KINDS[$kind]));
        if ($name === '' || mb_strlen($name) > 120) {
            throw new BooksException('Give the fee a name of up to 120 letters.');
        }
        $amount = round((float) ($d['amount'] ?? $f?->amount ?? 0), 2);
        if ($amount <= 0 || $amount > 100000000) {
            throw new BooksException('Give the amount of the fee.');
        }
        $ledger = (int) ($d['ledger_id'] ?? $f?->ledger_id ?? 0);
        if (! $ledger) {
            throw new BooksException('Choose the sales account this fee is booked under.');
        }
        // teaching is a service (Service Income accounts); a kit or a book is a product (Sales Accounts): either is fine here
        if (($problem = TradingAccounts::problem($ledger, 'sales', 'service')) && TradingAccounts::problem($ledger, 'sales', 'product')) {
            throw new BooksException($problem);
        }
        $row = ['kind' => $kind, 'name' => $name, 'amount' => $amount, 'ledger_id' => $ledger];
        foreach (['is_optional', 'once_per_student', 'refundable', 'is_active'] as $k) {
            if (array_key_exists($k, $d)) {
                $row[$k] = (bool) $d[$k];
            }
        }
        if ($f === null) {
            $row += ['once_per_student' => $kind === 'registration', 'refundable' => $kind !== 'registration', 'sort_order' => (int) Fee::where('offering_id', $o->id)->max('sort_order') + 10];
        }
        if (! empty($row['is_optional']) && ! empty($row['once_per_student'])) {
            throw new BooksException('A fee charged once per student can not also be optional.');
        }
        $f ??= new Fee(['offering_id' => $o->id, 'is_active' => true]);
        $f->fill($row)->save();

        return $f->fresh();
    }

    public function delete(Offering $o, Fee $f): void
    {
        if ((int) $f->offering_id !== (int) $o->id) {
            throw new BooksException('That fee belongs to another offering.');
        }
        if (DB::table('course_enrolment_lines')->where('fee_id', $f->id)->exists()) {
            throw new BooksException('Students have been charged this fee: switch it off instead.');
        }
        $f->delete();
    }

    /** @return array<int, array<string, mixed>> */
    public function rows(Offering $o): array
    {
        $ledgers = DB::table('ledgers')->whereIn('id', Fee::where('offering_id', $o->id)->pluck('ledger_id'))->pluck('name', 'id');

        return Fee::where('offering_id', $o->id)->orderBy('sort_order')->orderBy('id')->get()->map(fn (Fee $f) => ['id' => $f->id, 'kind' => $f->kind, 'kind_label' => Fee::KINDS[$f->kind] ?? $f->kind, 'name' => $f->name, 'ledger_id' => $f->ledger_id,
            'ledger' => $ledgers[$f->ledger_id] ?? null, 'amount' => (float) $f->amount, 'is_optional' => $f->is_optional, 'once_per_student' => $f->once_per_student, 'refundable' => $f->refundable, 'is_active' => $f->is_active])->values()->all();
    }
}
