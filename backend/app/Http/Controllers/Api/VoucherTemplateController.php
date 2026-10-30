<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Books\VoucherTemplateService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Books -> Vouchers -> Templates and the inbox of drafts a repeating template leaves. Seeing them needs books.view; making, changing and handling them needs books.post (routes). */
class VoucherTemplateController extends Controller
{
    public function __construct(private VoucherTemplateService $templates) {}

    private function off(): ?JsonResponse
    {
        return VoucherTemplateService::ready() ? null : response()->json(['ready' => false, 'templates' => [], 'drafts' => [], 'message' => 'Run script 250 to turn on voucher templates.']);
    }

    public function index(): JsonResponse
    {
        return $this->off() ?? response()->json(['ready' => true, 'templates' => $this->templates->all(), 'drafts' => $this->templates->drafts()]);
    }

    private function rules(): array
    {
        return ['name' => 'required|string|max:120', 'category' => 'nullable|string|max:40', 'form' => 'nullable|in:voucher,purchase', 'voucher_type_id' => 'nullable|integer|exists:voucher_types,id',
            'base_type' => 'nullable|string|max:30', 'form_state' => 'nullable|array', 'repeat_every' => 'nullable|in:' . implode(',', VoucherTemplateService::REPEATS), 'repeat_day' => 'nullable|integer|min:1|max:31',
            'is_active' => 'nullable|boolean'];
    }

    public function store(Request $request): JsonResponse
    {
        return $this->off() ?? response()->json(['data' => $this->templates->save($request->validate($this->rules()), $request->user())], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        return $this->off() ?? response()->json(['data' => $this->templates->save($request->validate($this->rules()), $request->user(), $id)]);
    }

    public function destroy(int $id): JsonResponse
    {
        if ($off = $this->off()) {
            return $off;
        }
        $this->templates->delete($id);

        return response()->json(['message' => 'Template deleted']);
    }

    public function starters(Request $request): JsonResponse
    {
        if ($off = $this->off()) {
            return $off;
        }
        $made = $this->templates->addStarters($request->user());

        return response()->json(['made' => $made, 'templates' => $this->templates->all()]);
    }

    /** A draft was opened (its form state is on the form now) or skipped. */
    public function handleDraft(Request $request, int $id): JsonResponse
    {
        if ($off = $this->off()) {
            return $off;
        }
        $d = $request->validate(['status' => 'required|in:opened,skipped,pending']);
        $this->templates->markDraft($id, $d['status'], $request->user());

        return response()->json(['drafts' => $this->templates->drafts()]);
    }

    /** Leave a draft for a template now, without waiting for its date. */
    public function draftNow(Request $request, int $id): JsonResponse
    {
        if ($off = $this->off()) {
            return $off;
        }
        $t = collect($this->templates->all())->firstWhere('id', $id);
        abort_unless($t, 404);
        \Illuminate\Support\Facades\DB::table('voucher_template_drafts')->updateOrInsert(['template_id' => $id, 'due_on' => today()->toDateString()],
            ['form_state' => json_encode($t['form_state']), 'status' => 'pending', 'created_at' => now(), 'updated_at' => now()]);

        return response()->json(['drafts' => $this->templates->drafts()], 201);
    }
}
