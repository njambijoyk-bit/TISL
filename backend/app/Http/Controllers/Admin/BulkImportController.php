<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\BulkImport\Formats\FileProblem;
use App\Services\BulkImport\Formats\Reader;
use App\Services\BulkImport\Formats\TemplateWriter;
use App\Services\BulkImport\ImportEntity;
use App\Services\BulkImport\ImportRegistry;
use App\Services\BulkImport\ImportRunner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Extras → Bulk import. The routes are behind the Extras module; what each person sees and may do is decided here, per module:
 * `bulkimport.<module>` (bulkimport.menus, bulkimport.ecommerce...), so a role can import E-commerce data and not Memberships.
 */
class BulkImportController extends Controller
{
    public function __construct(private ImportRegistry $registry)
    {
    }

    /** Everything this person may import, whether it is open now, why not, and what each is waiting for. */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json([
            'formats' => Reader::FORMATS, 'max_mb' => Reader::MAX_BYTES / 1048576, 'max_rows' => Reader::MAX_ROWS,
            'entities' => $this->registry->catalogue(fn (string $p) => $user->hasPermission($p)),
        ]);
    }

    public function template(Request $request, string $key, string $format): Response
    {
        $e = $this->entity($request, $key, false);
        if ($e instanceof JsonResponse) {
            return $e;
        }
        try {
            $t = app(TemplateWriter::class)->make($e, $format);
        } catch (FileProblem $p) {
            return response()->json(['message' => $p->getMessage(), 'code' => $p->codeName], 422);
        }

        return response($t['body'], 200, ['Content-Type' => $t['mime'], 'Content-Disposition' => 'attachment; filename="'.$t['filename'].'"']);
    }

    /** Check the file without saving anything. */
    public function preview(Request $request, string $key): JsonResponse
    {
        return $this->run($request, $key, false);
    }

    /** Save the file: all of it or none of it. */
    public function import(Request $request, string $key): JsonResponse
    {
        return $this->run($request, $key, true);
    }

    private function run(Request $request, string $key, bool $commit): JsonResponse
    {
        $e = $this->entity($request, $key, true);
        if ($e instanceof JsonResponse) {
            return $e;
        }
        $request->validate(['file' => 'required|file', 'format' => 'nullable|string|in:'.implode(',', Reader::FORMATS), 'mapping' => 'nullable']);
        $file = $request->file('file');
        $format = $request->input('format') ?: Reader::guess($file->getClientOriginalName());
        if (! $format) {
            return response()->json(['ok' => false, 'committed' => false, 'errors' => [['row' => 0, 'column' => null, 'code' => 'unsupported_format', 'message' => 'Could not tell the format from the file name. Choose csv, json, xml, xlsx or markdown.']], 'error_count' => 1, 'message' => 'Nothing was saved: unknown format.'], 422);
        }
        $mapping = $request->input('mapping');
        $mapping = is_string($mapping) ? json_decode($mapping, true) : $mapping;
        $result = app(ImportRunner::class)->run($e, $file->getRealPath(), $format, $commit, is_array($mapping) ? $mapping : null, $request->user()->id);

        return response()->json($result, $result['ok'] ? 200 : 422);
    }

    /** The thing asked for, if it exists, this person may import it, and (unless only a template is wanted) its module is on. */
    private function entity(Request $request, string $key, bool $needsOpen): ImportEntity|JsonResponse
    {
        $e = $this->registry->find($key);
        if (! $e) {
            return response()->json(['message' => 'There is nothing to import called that.'], 404);
        }
        if (! $request->user()->hasPermission($this->registry->permission($e))) {
            return response()->json(['message' => 'You are not allowed to import '.$e->label().'.'], 403);
        }
        if ($needsOpen && ($gate = $this->registry->gate($e))) {
            return response()->json(['ok' => false, 'committed' => false, 'errors' => [['row' => 0, 'column' => null, 'code' => $gate[0], 'message' => $gate[1]]], 'error_count' => 1, 'message' => 'Nothing was saved: '.$gate[1]], 422);
        }

        return $e;
    }
}
