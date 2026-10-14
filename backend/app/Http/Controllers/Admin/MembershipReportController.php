<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\Books\BooksException;
use App\Services\Memberships\MembershipReports;
use App\Services\Memberships\MembershipService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** Memberships → reports, and the members list as a spreadsheet. */
class MembershipReportController extends Controller
{
    public function __construct(private MembershipReports $reports)
    {
    }

    public function summary(Request $request): JsonResponse
    {
        if (! MembershipService::installed()) {
            return response()->json(['ready' => false]);
        }
        try {
            return response()->json(['ready' => true] + $this->reports->summary($request->query('from'), $request->query('to'), $request->integer('plan_id') ?: null));
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function csv(Request $request): StreamedResponse
    {
        abort_unless(MembershipService::installed(), 404);
        $rows = $this->reports->csv($request->integer('plan_id') ?: null, $request->query('status') ?: null);

        return response()->streamDownload(function () use ($rows) {
            $out = fopen('php://output', 'w');
            foreach ($rows as $r) {
                // a cell starting with = + - @ would be read as a formula by a spreadsheet: quote it as text
                fputcsv($out, array_map(fn ($v) => is_string($v) && $v !== '' && in_array($v[0], ['=', '+', '-', '@'], true) ? "'".$v : $v, $r));
            }
            fclose($out);
        }, 'members-'.now()->format('Y-m-d').'.csv', ['Content-Type' => 'text/csv; charset=UTF-8', 'Cache-Control' => 'no-store']);
    }
}
