<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\Books\BooksException;
use App\Services\Menus\Tips;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Menus → Tips: what is in the tips box, and handing tips over. */
class MenusTipsController extends Controller
{
    public function __construct(private Tips $tips)
    {
    }

    public function show(Request $request): JsonResponse
    {
        return response()->json($this->tips->screen($request->user()));
    }

    public function issue(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['to_user_id' => 'nullable|integer', 'to_name' => 'nullable|string|max:160', 'from_ledger_id' => 'required|integer', 'narration' => 'nullable|string|max:300']);
        try {
            $r = $this->tips->issue($id, $d, $request->user());
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['message' => $r['already'] ? 'That tip was already handed over.' : 'Tip handed over.', 'already' => $r['already']] + $this->tips->screen($request->user()));
    }
}
