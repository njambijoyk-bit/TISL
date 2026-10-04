<?php

namespace App\Models\Books;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One customer document sent from Books: e-mailed, or a WhatsApp chat opened for it. */
class DocumentShare extends Model
{
    protected $table = 'document_shares';

    protected $fillable = ['voucher_id', 'channel', 'to_address', 'subject', 'note', 'status', 'error', 'sent_by'];

    public function voucher(): BelongsTo
    {
        return $this->belongsTo(Voucher::class);
    }

    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sent_by');
    }
}
