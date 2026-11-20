<?php

namespace App\Services\Projects;

use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Books\VoucherService;
use Illuminate\Support\Facades\DB;

/**
 * The one door through which Projects puts a voucher into the books (stage 4). It goes through Books' own voucher service, so numbering,
 * locked periods, cost centres, budget control and everything else Books checks apply exactly as they do on the Books screens.
 * A refusal from Books comes back as a Projects refusal with Books' own words.
 */
class ProjectVoucherPoster
{
    /**
     * @param array<int, array<string, mixed>> $entries ledger_id, side, amount, and optionally cost_centre_id, project_holding_id, is_party, narration
     * @param array<int, array{against_voucher_id: int, amount: float}> $settles open sales invoices this journal settles (Books checks the party is credited for them)
     * @return int the voucher's id
     */
    public function journal(string $date, string $narration, ?string $reference, array $entries, User $by, array $settles = []): int
    {
        $type = DB::table('voucher_types')->where('base_type', 'journal')->where('is_active', 1)->orderBy('id')->value('id');
        if (! $type) {
            throw new ProjectException('The Journal voucher type is switched off in Books, so nothing can be recorded. Switch it on in Books first.', 409);
        }
        try {
            return (int) app(VoucherService::class)->create([
                'voucher_type_id' => (int) $type, 'date' => $date, 'narration' => $narration, 'reference_no' => $reference,
                'location_id' => \App\Models\Location::default()?->id, 'entries' => $entries, 'channel' => 'projects',
            ] + ($settles ? ['settles' => $settles] : []), $by)->id;
        } catch (BooksException $e) {
            throw new ProjectException($e->getMessage());
        } catch (\Illuminate\Validation\ValidationException $e) {
            throw new ProjectException(collect($e->errors())->flatten()->first() ?? 'The books refused it.');
        }
    }

    /**
     * A sales invoice to the project's client, on its cost centre, with the lines given (custom lines to an income ledger; the ledger decides the tax,
     * as on the Books form). @param array<int, array<string, mixed>> $lines @return array{id: int, number: string}
     */
    public function sales(string $date, int $customerId, array $lines, ?int $costCentreId, string $narration, ?string $reference, User $by): array
    {
        $type = DB::table('voucher_types')->where('base_type', 'sales')->where('is_active', 1)->orderBy('id')->value('id');
        if (! $type) {
            throw new ProjectException('The Sales invoice voucher type is switched off in Books, so nothing can be billed. Switch it on in Books first.', 409);
        }
        try {
            $v = app(VoucherService::class)->create([
                'voucher_type_id' => (int) $type, 'date' => $date, 'customer_id' => $customerId, 'narration' => $narration, 'reference_no' => $reference, 'cost_centre_id' => $costCentreId,
                'location_id' => \App\Models\Location::default()?->id, 'lines' => $lines, 'channel' => 'projects',
            ], $by);

            return ['id' => (int) $v->id, 'number' => (string) $v->voucher_number];
        } catch (BooksException $e) {
            throw new ProjectException($e->getMessage());
        } catch (\Illuminate\Validation\ValidationException $e) {
            throw new ProjectException(collect($e->errors())->flatten()->first() ?? 'The books refused it.');
        }
    }

    /**
     * A purchase invoice from a vendor (stage 10: a certified subcontract claim), on the work's cost centre, to the supplier's own ledger in Books
     * (made for the vendor when it has none). @param array<int, array<string, mixed>> $lines @return array{id: int, number: string, party_ledger_id: int}
     */
    public function purchase(string $date, int $vendorId, array $lines, ?int $costCentreId, string $narration, ?string $reference, User $by): array
    {
        $type = DB::table('voucher_types')->where('base_type', 'purchase')->where('is_active', 1)->orderBy('id')->value('id');
        if (! $type) {
            throw new ProjectException('The Purchase invoice voucher type is switched off in Books, so nothing can be billed. Switch it on in Books first.', 409);
        }
        $party = $this->supplierLedger($vendorId);
        try {
            $v = app(VoucherService::class)->create([
                'voucher_type_id' => (int) $type, 'date' => $date, 'party_ledger_id' => $party, 'narration' => $narration, 'reference_no' => $reference, 'cost_centre_id' => $costCentreId,
                'location_id' => \App\Models\Location::default()?->id, 'lines' => $lines, 'channel' => 'projects',
            ], $by);

            return ['id' => (int) $v->id, 'number' => (string) $v->voucher_number, 'party_ledger_id' => $party];
        } catch (BooksException $e) {
            throw new ProjectException($e->getMessage());
        } catch (\Illuminate\Validation\ValidationException $e) {
            throw new ProjectException(collect($e->errors())->flatten()->first() ?? 'The books refused it.');
        }
    }

    /** The vendor's own supplier ledger in Books (made when it has none). */
    public function supplierLedger(int $vendorId): int
    {
        $vendor = \App\Models\Vendor::find($vendorId) ?? throw new ProjectException('That vendor is not there any more.');
        try {
            return (int) app(\App\Services\Books\LedgerService::class)->vendorLedger($vendor)->id;
        } catch (\Illuminate\Database\Eloquent\ModelNotFoundException) {
            throw new ProjectException('The books have no Sundry Creditors group to keep the vendor\'s account in.', 409);
        }
    }
}
