<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Extras\TenderDocument;
use App\Services\Tenders\TenderFile;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** Opens a tender file through a signed, short-lived link (made by staff or by a vendor who may see the tender); the signature is the permission. */
class TenderFileController extends Controller
{
    public function show(Request $request, int $doc): StreamedResponse
    {
        return TenderFile::response(TenderDocument::findOrFail($doc), $request->boolean('inline'));
    }
}
