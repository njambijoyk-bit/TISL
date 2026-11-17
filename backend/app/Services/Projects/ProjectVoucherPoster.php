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
    /** @param array<int, array<string, mixed>> $entries ledger_id, side, amount, and optionally cost_centre_id, project_holding_id, narration @return int the voucher's id */
    public function journal(string $date, string $narration, ?string $reference, array $entries, User $by): int
    {
        $type = DB::table('voucher_types')->where('base_type', 'journal')->where('is_active', 1)->orderBy('id')->value('id');
        if (! $type) {
            throw new ProjectException('The Journal voucher type is switched off in Books, so nothing can be recorded. Switch it on in Books first.', 409);
        }
        try {
            return (int) app(VoucherService::class)->create([
                'voucher_type_id' => (int) $type, 'date' => $date, 'narration' => $narration, 'reference_no' => $reference,
                'location_id' => \App\Models\Location::default()?->id, 'entries' => $entries, 'channel' => 'projects',
            ], $by)->id;
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
}
