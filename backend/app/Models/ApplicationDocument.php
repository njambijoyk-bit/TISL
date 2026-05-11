<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

class ApplicationDocument extends Model
{
    use HasFactory;

    const TYPES = [
        'cv',
        'cover_letter',
        'certificate',
        'portfolio',
        'id_document',
        'other',
    ];

    const TYPE_LABELS = [
        'cv'            => 'CV / Résumé',
        'cover_letter'  => 'Cover Letter',
        'certificate'   => 'Certificate',
        'portfolio'     => 'Portfolio',
        'id_document'   => 'ID Document',
        'other'         => 'Other',
    ];

    const ALLOWED_MIMES = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg',
        'image/png',
    ];

    const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

    protected $fillable = [
        'application_id',
        'type',
        'original_filename',
        'disk',
        'path',
        'mime_type',
        'size_bytes',
    ];

    protected $casts = [
        'size_bytes' => 'integer',
    ];

    // ── Computed ──────────────────────────────────────────────────────────────

    public function getTypeLabelAttribute(): string
    {
        return self::TYPE_LABELS[$this->type] ?? ucfirst($this->type);
    }

    public function getSizeFormattedAttribute(): string
    {
        $bytes = $this->size_bytes ?? 0;

        if ($bytes >= 1048576) {
            return round($bytes / 1048576, 1) . ' MB';
        }

        return round($bytes / 1024, 1) . ' KB';
    }

    /**
     * Returns a temporary signed URL (works for both local and s3).
     * Controllers should use this — never expose the raw path.
     */
    public function getTemporaryUrl(int $minutesTtl = 15): string
    {
        if ($this->disk === 's3') {
            return Storage::disk('s3')->temporaryUrl($this->path, now()->addMinutes($minutesTtl));
        }

        return Storage::disk('public')->url($this->path);
    }
    

    public function isPdf(): bool
    {
        return $this->mime_type === 'application/pdf';
    }

    // ── Relations ─────────────────────────────────────────────────────────────

    public function application()
    {
        return $this->belongsTo(Application::class);
    }
}