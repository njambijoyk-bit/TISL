<?php

namespace App\Services\Tenders;

use App\Models\Extras\TenderDocument;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Serves an uploaded tender file. A PDF opens in the browser; an HTML page opens in a locked-down frame (no scripts, no forms, nothing loaded from other sites
 * except images), so an uploaded page can never act as the website; everything else is downloaded.
 */
class TenderFile
{
    private const HTML = ['html', 'htm'];

    public static function allowedExtensions(): array
    {
        return ['pdf', 'html', 'htm', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'png', 'jpg', 'jpeg'];
    }

    public static function isHtml(TenderDocument $doc): bool
    {
        return in_array(strtolower((string) $doc->extension), self::HTML, true);
    }

    public static function response(TenderDocument $doc, bool $inline): StreamedResponse
    {
        abort_unless(Storage::disk('local')->exists($doc->file_path), 404);

        $ext = strtolower((string) $doc->extension);
        $name = $doc->original_filename ?: ($doc->name . '.' . $ext);
        $headers = ['X-Content-Type-Options' => 'nosniff'];

        if ($inline && $ext === 'pdf') {
            return Storage::disk('local')->response($doc->file_path, $name, $headers + ['Content-Type' => 'application/pdf'], 'inline');
        }
        if ($inline && self::isHtml($doc)) {
            return Storage::disk('local')->response($doc->file_path, $name, $headers + [
                'Content-Type'            => 'text/html; charset=utf-8',
                'Content-Security-Policy' => "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data: https:; font-src data:; base-uri 'none'; form-action 'none'",
            ], 'inline');
        }

        return Storage::disk('local')->download($doc->file_path, $name, $headers);
    }
}
