<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CompanyProfile;
use App\Models\ExchangeConnection;
use App\Models\ExchangeKey;
use App\Models\Location;
use App\Services\Exchange\ConnectionFetcher;
use App\Services\Exchange\WnkjapException;
use App\Services\Exchange\WnkjapExport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

/**
 * Books exchange. This system makes .wnkjap exports (download, or fetched by another company's viewer with a key) and can fetch another company's export
 * for the browser to open. Nothing of another company is ever stored here; see docs/WNKJAP_FORMAT.md.
 */
class ExchangeController extends Controller
{
    public function __construct(private WnkjapExport $export) {}

    private function guard(callable $fn)
    {
        try {
            return $fn();
        } catch (WnkjapException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    private function download(string $bytes, int $level): Response
    {
        $name = 'books-' . Str::slug(CompanyProfile::current()->short_code ?: CompanyProfile::current()->name ?: 'company') . '-' . now()->format('Ymd') . "-L{$level}.wnkjap";

        return response($bytes, 200, ['Content-Type' => 'application/octet-stream', 'Content-Disposition' => 'attachment; filename="' . $name . '"', 'Content-Length' => strlen($bytes), 'Cache-Control' => 'no-store']);
    }

    private function rules(): array
    {
        return ['level' => 'required|integer|min:1|max:4', 'from' => 'nullable|date', 'to' => 'nullable|date|after_or_equal:from', 'location_id' => 'nullable|integer|exists:locations,id'];
    }

    /** GET /admin/exchange/options */
    public function options(Request $request): JsonResponse
    {
        return response()->json(['levels' => collect(WnkjapExport::LEVELS)->map(fn ($label, $n) => ['level' => $n, 'label' => $label])->values(), 'branches' => Location::orderBy('name')->get(['id', 'name']),
            'ready' => ExchangeKey::ready() && ExchangeConnection::ready(), 'company' => CompanyProfile::current()->name]);
    }

    // ------------------------------------------------------------ making files

    /** POST /admin/exchange/export {password, level, from?, to?, location_id?}: the books as a sealed file, downloaded. */
    public function exportFile(Request $request)
    {
        $d = $request->validate($this->rules() + ['password' => 'required|string|min:8|max:200']);

        return $this->guard(fn () => $this->download($this->export->file((int) $d['level'], $d['from'] ?? null, $d['to'] ?? null, isset($d['location_id']) ? (int) $d['location_id'] : null, $d['password'], $request->user()), (int) $d['level']));
    }

    /** GET /api/exchange/export?level=&from=&to=&location_id= with a key: the file another company's viewer fetches. Capped at the key's depth. */
    public function pull(Request $request)
    {
        /** @var ExchangeKey $key */
        $key = $request->attributes->get('exchange_key');
        $d = $request->validate($this->rules());
        if ((int) $d['level'] > $key->max_level) {
            return response()->json(['message' => "This key may only fetch up to level {$key->max_level}."], 403);
        }

        return $this->guard(function () use ($key, $d, $request) {
            $level = (int) $d['level'];
            $bytes = $this->export->file($level, $d['from'] ?? null, $d['to'] ?? null, isset($d['location_id']) ? (int) $d['location_id'] : null, $key->filePassword(), null);
            $key->forceFill(['last_used_at' => now(), 'last_used_ip' => $request->ip(), 'uses' => $key->uses + 1])->save();

            return $this->download($bytes, $level);
        });
    }

    // ------------------------------------------------------------ keys

    public function keys(): JsonResponse
    {
        return response()->json(['data' => ExchangeKey::ready() ? ExchangeKey::orderByDesc('id')->get(['id', 'label', 'key_id', 'max_level', 'is_active', 'last_used_at', 'last_used_ip', 'uses', 'created_at', 'revoked_at']) : []]);
    }

    /** POST /admin/exchange/keys {label, max_level}: the key text and the file password are shown once, here, and never again. */
    public function makeKey(Request $request): JsonResponse
    {
        $d = $request->validate(['label' => 'required|string|max:120', 'max_level' => 'required|integer|min:1|max:4']);
        if (! ExchangeKey::ready()) {
            return response()->json(['message' => 'Run database script 104_exchange.sql first.'], 422);
        }
        [$key, $text, $password] = ExchangeKey::make(trim($d['label']), (int) $d['max_level'], $request->user()?->id);

        return response()->json(['message' => 'Key made. Copy both now: they are not shown again.', 'data' => ['id' => $key->id, 'key' => $text, 'file_password' => $password]], 201);
    }

    public function revokeKey(int $id): JsonResponse
    {
        ExchangeKey::findOrFail($id)->forceFill(['is_active' => false, 'revoked_at' => now()])->save();

        return response()->json(['message' => 'Key switched off.']);
    }

    // ------------------------------------------------------------ connections (other companies to fetch from)

    public function connections(): JsonResponse
    {
        return response()->json(['ready' => ExchangeConnection::ready(), 'data' => ExchangeConnection::ready() ? ExchangeConnection::orderBy('name')->get(['id', 'name', 'base_url', 'created_at']) : []]);
    }

    private function connectionRules(bool $new): array
    {
        return ['name' => 'required|string|max:160', 'base_url' => 'required|url|max:255', 'key' => ($new ? 'required' : 'nullable') . '|string|max:200'];
    }

    public function saveConnection(Request $request, ?int $id = null): JsonResponse
    {
        $d = $request->validate($this->connectionRules($id === null));
        if (! ExchangeConnection::ready()) {
            return response()->json(['message' => 'Run database script 104_exchange.sql first.'], 422);
        }

        return $this->guard(function () use ($d, $id, $request) {
            app(ConnectionFetcher::class)->assertSafe($d['base_url']);
            $c = $id ? ExchangeConnection::findOrFail($id) : new ExchangeConnection(['created_by' => $request->user()?->id]);
            $c->fill(['name' => trim($d['name']), 'base_url' => rtrim($d['base_url'], '/')]);
            if (! empty($d['key'])) {
                $c->setKey(trim($d['key']));
            }
            $c->save();

            return response()->json(['message' => 'Saved.', 'data' => $c->only(['id', 'name', 'base_url'])], $id ? 200 : 201);
        });
    }

    public function deleteConnection(int $id): JsonResponse
    {
        ExchangeConnection::findOrFail($id)->delete();

        return response()->json(['message' => 'Removed.']);
    }

    /** POST /admin/exchange/connections/{id}/fetch {level, from?, to?, location_id?}: the other company's sealed file, relayed unopened to the browser. */
    public function fetch(Request $request, int $id)
    {
        $d = $request->validate($this->rules());
        $c = ExchangeConnection::findOrFail($id);

        return $this->guard(fn () => $this->download(app(ConnectionFetcher::class)->fetch($c, (int) $d['level'], $d['from'] ?? null, $d['to'] ?? null, isset($d['location_id']) ? (int) $d['location_id'] : null), (int) $d['level']));
    }
}
