<?php

namespace App\Models\Books;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class VoucherEntry extends Model
{
    public $timestamps = false;

    protected $table = 'voucher_entries';

    protected $fillable = ['voucher_id', 'line_no', 'ledger_id', 'side', 'amount', 'base_amount', 'is_party', 'is_tax', 'narration', 'cost_centre_id', 'location_id', 'initiative_id', 'project_holding_id', 'created_at'];

    /** Has script 260 added the column that ties a line to a client's held money (Projects)? */
    public static function holdsClientMoney(): bool
    {
        if (! app()->bound('books.entries.holding')) {   // once per request, kept in the container so it never outlives the app it was asked in
            app()->instance('books.entries.holding', \Illuminate\Support\Facades\Schema::hasColumn('voucher_entries', 'project_holding_id'));
        }

        return (bool) app('books.entries.holding');
    }

    /** For a script that adds the column after the first look. */
    public static function forgetHolding(): void
    {
        app()->offsetUnset('books.entries.holding');
    }

    protected $casts = [
        'amount'      => 'decimal:2',
        'base_amount' => 'decimal:2',
        'is_party'    => 'boolean',
        'is_tax'      => 'boolean',
    ];

    public function voucher(): BelongsTo
    {
        return $this->belongsTo(Voucher::class);
    }

    public function ledger(): BelongsTo
    {
        return $this->belongsTo(Ledger::class);
    }
}
