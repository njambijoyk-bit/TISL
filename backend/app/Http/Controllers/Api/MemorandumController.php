<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Services\Books\BooksException;
use App\Services\Books\MemorandumService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Memoranda: anyone on the staff side (a driver too) can write one; only the finance roles can edit, convert or dismiss. A person who is not
 * finance sees the ones they wrote themselves.
 */
class MemorandumController extends Controller
{
    private const FINANCE = ['admin', 'super_admin', 'finance'];
    private const NOT_STAFF = ['customer', 'applicant'];

    public function __construct(private MemorandumService $memos) {}

    private function staff(Request $r): void
    {
        abort_if(! $r->user() || in_array($r->user()->role, self::NOT_STAFF, true), 403, 'Memoranda are for staff.');
    }

    private function finance(Request $r): bool
    {
        return in_array($r->user()?->role, self::FINANCE, true);
    }

    private function mine(Request $r, int $id): Voucher
    {
        $v = Voucher::whereHas('type', fn ($t) => $t->where('base_type', VoucherType::MEMORANDUM))->findOrFail($id);
        abort_unless($this->finance($r) || (int) $v->created_by === (int) $r->user()->id, 404);

        return $v;
    }

    private function run(callable $fn): JsonResponse
    {
        try {
            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function index(Request $request): JsonResponse
    {
        $this->staff($request);
        $state = (string) $request->query('state', '');
        $q = Voucher::whereHas('type', fn ($t) => $t->where('base_type', VoucherType::MEMORANDUM))
            ->when(! $this->finance($request), fn ($w) => $w->where('created_by', $request->user()->id))
            ->when($request->filled('about_voucher_id'), fn ($w) => $w->where('meta->memo->about_voucher_id', (int) $request->query('about_voucher_id')))
            ->when($request->filled('purpose'), fn ($w) => $w->where('meta->memo->purpose', (string) $request->query('purpose')))
            ->when($request->filled('q'), fn ($w) => $w->where(fn ($x) => $x->where('voucher_number', 'like', '%' . trim((string) $request->query('q')) . '%')->orWhere('narration', 'like', '%' . trim((string) $request->query('q')) . '%')))
            ->orderByDesc('date')->orderByDesc('id');
        $page = $q->paginate(min((int) $request->query('per_page', 30), 100));
        $rows = $page->getCollection()->map(fn ($v) => $this->memos->present($v));
        if (in_array($state, ['open', 'converted', 'dismissed'], true)) {
            $rows = $rows->where('state', $state)->values();   // a state can depend on another voucher (the journal it made), so it is worked out per row
        }
        $page->setCollection($rows);

        return response()->json($page->toArray() + ["purposes" => MemorandumService::PURPOSES]);
    }

    public function show(Request $request, $id): JsonResponse
    {
        $this->staff($request);

        return response()->json($this->memos->present($this->mine($request, (int) $id)) + ['can_manage' => $this->finance($request)]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->staff($request);
        $d = $request->validate([
            'narration' => 'required|string|max:5000', 'purpose' => 'nullable|string|max:40', 'direction' => 'nullable|in:in,out', 'amount' => 'nullable|numeric|min:0',
            'date' => 'nullable|date', 'reference_no' => 'nullable|string|max:100', 'about_voucher_id' => 'nullable|integer',
            'lines' => 'nullable|array|max:40', 'lines.*.ledger_id' => 'nullable|integer', 'lines.*.side' => 'nullable|string', 'lines.*.amount' => 'nullable|numeric', 'lines.*.narration' => 'nullable|string|max:255',
        ]);
        if (! $this->finance($request)) {
            unset($d['lines']);   // picking ledgers is the finance roles' work: others write the note, finance adds the lines
        }

        return $this->run(function () use ($d, $request) {
            $v = $this->memos->create($d, $request->user());

            return response()->json(['message' => "{$v->voucher_number} saved", 'data' => $this->memos->present($v)], 201);
        });
    }

    public function update(Request $request, $id): JsonResponse
    {
        $this->staff($request);
        abort_unless($this->finance($request), 403, 'Only finance can edit a memorandum.');
        $d = $request->validate([
            'narration' => 'sometimes|required|string|max:5000', 'purpose' => 'nullable|string|max:40', 'direction' => 'nullable|in:in,out', 'amount' => 'nullable|numeric|min:0',
            'date' => 'nullable|date', 'reference_no' => 'nullable|string|max:100', 'about_voucher_id' => 'nullable|integer',
            'lines' => 'nullable|array|max:40', 'lines.*.ledger_id' => 'nullable|integer', 'lines.*.side' => 'nullable|string', 'lines.*.amount' => 'nullable|numeric', 'lines.*.narration' => 'nullable|string|max:255',
        ]);

        return $this->run(function () use ($d, $request, $id) {
            $v = $this->memos->update($this->mine($request, (int) $id), $d, $request->user());

            return response()->json(['message' => "{$v->voucher_number} updated", 'data' => $this->memos->present($v)]);
        });
    }

    public function destroy(Request $request, $id): JsonResponse
    {
        $this->staff($request);
        abort_unless($this->finance($request), 403, 'Only finance can dismiss a memorandum.');
        $request->validate(['reason' => 'nullable|string|max:255']);

        return $this->run(function () use ($request, $id) {
            $v = $this->memos->dismiss($this->mine($request, (int) $id), $request->input('reason'), $request->user());

            return response()->json(['message' => "{$v->voucher_number} dismissed", 'data' => $this->memos->present($v)]);
        });
    }

    public function convert(Request $request, $id): JsonResponse
    {
        $this->staff($request);
        abort_unless($this->finance($request), 403, 'Only finance can convert a memorandum.');
        $d = $request->validate(['to' => 'nullable|in:journal,contra', 'date' => 'nullable|date']);

        return $this->run(function () use ($d, $request, $id) {
            $made = $this->memos->convert($this->mine($request, (int) $id), $d, $request->user());

            return response()->json(['message' => "{$made->voucher_number} created", 'voucher_id' => $made->id, 'voucher_number' => $made->voucher_number]);
        });
    }
}
