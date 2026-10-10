<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Codes\CodeException;
use App\Services\Codes\CodeFactory;
use App\Services\Codes\CodeResolvers;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/** The doors to the Codes core: where a scanned QR leads (public), what staff scanning does (staff), and the picture of a code (staff). */
class CodeController extends Controller
{
    public function __construct(private CodeResolvers $resolvers)
    {
    }

    /** GET /q/{code}: a customer's phone camera opened the address in a QR. Says where to go. */
    public function open(string $code): JsonResponse
    {
        $i = $this->resolvers->identify($code);
        $path = $i ? $this->resolvers->publicPath($code) : null;
        if (! $i || ! $path) {
            return response()->json(['message' => 'This code is not valid.'], 404);
        }

        return response()->json(['type' => $i['type'], 'label' => $i['label'], 'path' => $path]);
    }

    /** POST /admin/codes/scan {code, context}: staff scanned a code; the type decides what that does and who may. */
    public function scan(Request $request): JsonResponse
    {
        $d = $request->validate(['code' => 'required|string|max:400', 'context' => 'nullable|array']);
        try {
            return response()->json($this->resolvers->scan($d['code'], $request->user(), (array) ($d['context'] ?? [])));
        } catch (CodeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    /** GET /admin/codes/kinds: what can be made, for the pickers. */
    public function kinds(): JsonResponse
    {
        return response()->json(['kinds' => collect(CodeFactory::KINDS)->map(fn ($k, $key) => ['key' => $key, 'label' => $k[0], 'two_d' => $k[1], 'for_labels' => ! in_array($key, ['gs1128', 'gs1datamatrix'], true)]   // the GS1 kinds need the (AI)value form, so an item's plain code can not be one)->values(), 'signed_types' => $this->resolvers->types()]);
    }

    /** GET /admin/codes/image?kind=&data=&format=svg|png&…: the picture of a code (for previews and printing). */
    public function image(Request $request): Response|JsonResponse
    {
        $d = $request->validate([
            'kind' => 'required|string|max:12', 'data' => 'required|string|max:2000', 'format' => 'nullable|in:svg,png', 'level' => 'nullable|in:L,M,Q,H', 'check' => 'nullable|boolean', 'text' => 'nullable|boolean',
            'unit' => 'nullable|numeric|min:0.5|max:20', 'height' => 'nullable|numeric|min:10|max:400', 'scale' => 'nullable|integer|min:1|max:20', 'fg' => ['nullable', 'regex:/^#[0-9a-fA-F]{6}$/'], 'bg' => ['nullable', 'regex:/^#[0-9a-fA-F]{6}$/'],
        ]);
        try {
            $code = CodeFactory::make($d['kind'], $d['data'], ['level' => $d['level'] ?? 'M', 'check' => $request->boolean('check'), 'text' => $request->boolean('text', true)]);
            $opts = array_filter(['unit' => $d['unit'] ?? null, 'height' => $d['height'] ?? null, 'scale' => $d['scale'] ?? null, 'fg' => $d['fg'] ?? null, 'bg' => $d['bg'] ?? null], fn ($v) => $v !== null);
            if (($d['format'] ?? 'svg') === 'png') {
                return response($code->png($opts), 200, ['Content-Type' => 'image/png', 'Cache-Control' => 'private, max-age=3600']);
            }

            return response($code->svg($opts), 200, ['Content-Type' => 'image/svg+xml', 'Cache-Control' => 'private, max-age=3600']);
        } catch (CodeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }
}
