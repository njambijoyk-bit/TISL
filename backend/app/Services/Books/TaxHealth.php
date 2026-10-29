<?php

namespace App\Services\Books;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Checks on the tax set-up (docs/TAX_CONTROL_PLAN.md, T7): things that would make a document tax wrongly or leave a tax with nowhere to post.
 * Read-only. Each finding says what is wrong, where, and what to do; none of them changes any data.
 */
class TaxHealth
{
    /** @return array<int, array{code: string, level: string, message: string, ref: string|null}> */
    public function checks(): array
    {
        if (! Schema::hasTable('ledger_groups') || ! Schema::hasColumn('ledger_groups', 'application_method')) {
            return [['code' => 'script_229', 'level' => 'warning', 'message' => 'Run database script 229_tax_control.sql to turn on Tax control.', 'ref' => null]];
        }
        $out = [];
        $add = function (string $code, string $level, string $message, ?string $ref = null) use (&$out) {
            $out[] = compact('code', 'level', 'message', 'ref');
        };
        $types = DB::table('ledger_groups')->where('behaviour', 'tax')->whereNotNull('application_mode')->get();
        $today = today()->toDateString();

        foreach ($types as $t) {
            $name = "{$t->name} ({$t->code})";
            if (! $t->tax_category || ! $t->application_method) {
                $add('type_unset', 'error', "{$name} has no category or no way of being applied. Edit it on Tax & Compliance → Tax types.", "type:{$t->id}");
            }
            $active = (bool) ($t->is_active ?? 1);
            $rates = DB::table('ledgers')->where('group_id', $t->id)->whereNotNull('rate_type')->get();
            if ($active && $rates->where('is_active', 1)->filter(fn ($r) => (! $r->valid_from || $r->valid_from <= $today) && (! $r->valid_until || $r->valid_until >= $today))->isEmpty() && $t->application_method !== 'withheld') {
                $add('no_rate_in_force', 'warning', "{$name} is active but has no rate in force today.", "type:{$t->id}");
            }
            if ($t->application_method === 'reverse_charge' && ! $t->input_ledger_id && ! $t->cost_ledger_id) {
                $add('reverse_no_ledger', 'error', "{$name} is a reverse charge but has no input-tax ledger or cost ledger, so the amount claimed has nowhere to go.", "type:{$t->id}");
            }
            if ($t->application_method === 'withheld' && ! $t->payable_ledger_id) {
                $add('withheld_no_payable', 'error', "{$name} is withheld at source but has no payable ledger.", "type:{$t->id}");
            }
            if (in_array($t->application_method, ['added', 'included'], true) && ! $t->control_ledger_id && $rates->isEmpty()) {
                $add('no_ledgers', 'warning', "{$name} has no rates and no control ledger yet.", "type:{$t->id}");
            }
            foreach ($rates as $r) {
                $list = $r->base_includes ? json_decode((string) $r->base_includes, true) : null;
                foreach (is_array($list) ? $list : [] as $id) {
                    if (! $types->contains('id', (int) $id)) {
                        $add('base_missing_type', 'error', "The rate {$r->name} adds a tax that no longer exists to its base.", "rate:{$r->id}");
                    }
                }
            }
        }

        if (Schema::hasTable('ledger_taxes')) {
            $rows = DB::table('ledger_taxes as lt')->join('ledgers as l', 'l.id', '=', 'lt.ledger_id')->leftJoin('ledgers as r', 'r.id', '=', 'lt.tax_rate_id')
                ->select('lt.*', 'l.name as account', 'r.name as rate', 'r.is_active as rate_active', 'r.valid_until as rate_until')->get();
            foreach ($rows as $x) {
                if (! $types->contains('id', (int) $x->tax_type_id)) {
                    $add('account_tax_missing', 'error', "The account {$x->account} carries a tax type that no longer exists.", "ledger:{$x->ledger_id}");
                } elseif (in_array($x->treatment, ['applies', 'zero_rated'], true) && ! $x->tax_rate_id) {
                    $add('account_no_rate', 'error', "The account {$x->account} carries a tax with no rate chosen, so it charges nothing.", "ledger:{$x->ledger_id}");
                } elseif ($x->tax_rate_id && ($x->rate === null || ! $x->rate_active || ($x->rate_until && $x->rate_until < $today))) {
                    $add('account_rate_ended', 'warning', "The account {$x->account} carries the rate " . ($x->rate ?? 'that was removed') . ', which is no longer in force. Choose the current rate.', "ledger:{$x->ledger_id}");
                }
            }
            // a sales or purchase account with a tax nature but none of the new rows (for example created before script 229)
            $unmapped = DB::table('ledgers as l')->whereNotNull('l.tax_nature')->whereIn('l.tax_nature', ['taxable', 'zero_rated'])
                ->whereNotExists(fn ($q) => $q->select(DB::raw(1))->from('ledger_taxes as lt')->whereColumn('lt.ledger_id', 'l.id'))->limit(20)->pluck('l.name');
            foreach ($unmapped as $n) {
                $add('account_not_mapped', 'warning', "The account {$n} is marked as taxable but has no tax rows. Open it in the chart of accounts and save it.", null);
            }
        }

        if (Schema::hasTable('tax_opt_outs')) {
            $gone = DB::table('tax_opt_outs')->whereNotIn('tax_type_id', $types->pluck('id'))->count();
            if ($gone) {
                $add('opt_out_missing_type', 'warning', "{$gone} item opt-out(s) refer to a tax type that no longer exists.", null);
            }
        }

        return $out;
    }
}
