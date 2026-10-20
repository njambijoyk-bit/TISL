<?php

namespace App\Models\Extras;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class TenderBidDocument extends Model
{
    use HasFactory;

    protected $fillable = [
        'tender_bid_id',
        'name',
        'original_filename',
        'mime_type',
        'extension',
        'file_path',
        'file_size',
        'document_type',
    ];

    protected $casts = [
        'file_size' => 'integer',
    ];

    public function bid()
    {
        return $this->belongsTo(TenderBid::class, 'tender_bid_id');
    }
}
