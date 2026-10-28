<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The statements tree (Balance sheet and Income statement, their sections and lines; database/sql/227_statements.sql).
 * Reading it needs books.reports.settings; changing it needs books.statements (both on the routes).
 * The rows the script made are system rows: they can be renamed, hidden and reordered but not deleted, moved or given another nature.
 */
class StatementController extends Controller
{
    private const SIDE = ['asset' => 'D', 'expense' => 'D', 'liability' => 'C', 'income' => 'C'];

    private function ready(): bool
    {
        return Schema::hasTable('statements');
    }

    private function notReady(): JsonResponse
    {
        return response()->json(['ready' => false, 'message' => 'Run database script 227_statements.sql to turn on the statements.', 'rows' => []]);
    }

    /** The whole tree in reading order, each row with how many groups and ledgers sit on it. */
    public function index(): JsonResponse
    {
        if (! $this->ready()) {
            return $this->notReady();
        }

        return response()->json(['ready' => true, 'rows' => $this->tree()]);
    }

    public function store(Request $request): JsonResponse
    {
        if (! $this->ready()) {
            return $this->notReady();
        }
        $d = $request->validate([
            'parent_id' => 'required|integer|exists:statements,id', 'name' => 'required|string|max:120',
            'kind' => 'required|in:heading,line', 'nature' => 'nullable|in:asset,liability,income,expense',
        ]);
        $parent = DB::table('statements')->where('id', $d['parent_id'])->first();
        abort_unless($parent->kind === 'heading', 422, 'Rows are added under a heading, not under a line.');
        $root = $this->rootCode($parent);
        if ($d['kind'] === 'line') {
            $allowed = $root === 'BS' ? ['asset', 'liability'] : ['income', 'expense'];
            abort_unless(! empty($d['nature']) && in_array($d['nature'], $allowed, true), 422, $root === 'BS'
                ? 'A line on the balance sheet is an asset or a liability (equity counts as a liability).'
                : 'A line on the income statement is income or an expense.');
        }
        $name = trim($d['name']);
        abort_if(DB::table('statements')->where('parent_id', $parent->id)->whereRaw('LOWER(name) = ?', [mb_strtolower($name)])->exists(), 422, 'There is already a row with that name here.');

        $id = DB::table('statements')->insertGetId([
            'parent_id' => $parent->id, 'code' => $this->newCode($parent->code, $name), 'name' => $name, 'kind' => $d['kind'],
            'nature' => $d['kind'] === 'line' ? $d['nature'] : null, 'normal_side' => $d['kind'] === 'line' ? self::SIDE[$d['nature']] : null,
            'sort_order' => (int) DB::table('statements')->where('parent_id', $parent->id)->max('sort_order') + 1, 'is_system' => 0, 'is_active' => 1,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        return response()->json(['message' => 'Added', 'id' => $id, 'rows' => $this->tree()], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        if (! $this->ready()) {
            return $this->notReady();
        }
        $row = DB::table('statements')->where('id', $id)->first();
        abort_unless($row, 404, 'Row not found.');
        $d = $request->validate(['name' => 'sometimes|string|max:120', 'sort_order' => 'sometimes|integer|min:0|max:9999', 'is_active' => 'sometimes|boolean']);
        $set = [];
        if (isset($d['name'])) {
            $name = trim($d['name']);
            abort_if($name === '', 422, 'Give it a name.');
            abort_if(DB::table('statements')->where('parent_id', $row->parent_id)->where('id', '<>', $id)->whereRaw('LOWER(name) = ?', [mb_strtolower($name)])->exists(), 422, 'There is already a row with that name here.');
            $set['name'] = $name;
        }
        if (isset($d['sort_order'])) {
            $set['sort_order'] = $d['sort_order'];
        }
        if (array_key_exists('is_active', $d) && (bool) $d['is_active'] !== (bool) $row->is_active) {
            if (! $d['is_active']) {
                abort_if($this->members($id) > 0, 422, 'Groups or ledgers are on this row. Move them to another row first.');
                abort_if(DB::table('statements')->where('parent_id', $id)->where('is_active', 1)->exists(), 422, 'Hide the rows under it first.');
            }
            $set['is_active'] = $d['is_active'] ? 1 : 0;
        }
        if ($set) {
            DB::table('statements')->where('id', $id)->update($set + ['updated_at' => now()]);
        }

        return response()->json(['message' => 'Saved', 'rows' => $this->tree()]);
    }

    public function destroy(int $id): JsonResponse
    {
        if (! $this->ready()) {
            return $this->notReady();
        }
        $row = DB::table('statements')->where('id', $id)->first();
        abort_unless($row, 404, 'Row not found.');
        abort_if($row->is_system, 422, 'The built-in rows cannot be deleted. Hide one instead.');
        abort_if(DB::table('statements')->where('parent_id', $id)->exists(), 422, 'It has rows under it. Delete those first.');
        abort_if($this->members($id) > 0, 422, 'Groups or ledgers are on this row. Move them to another row first.');
        DB::table('statements')->where('id', $id)->delete();

        return response()->json(['message' => 'Deleted', 'rows' => $this->tree()]);
    }

    /** Groups and ledgers that have this row as their own. */
    private function members(int $id): int
    {
        return (int) DB::table('ledger_groups')->where('statement_id', $id)->count() + (int) DB::table('ledgers')->where('statement_id', $id)->count();
    }

    private function rootCode(object $row): string
    {
        return explode('.', $row->code)[0];
    }

    /** PARENT.SLUG, with a number added when that code is taken. */
    private function newCode(string $parentCode, string $name): string
    {
        $slug = strtoupper(substr(preg_replace('/[^A-Za-z0-9]+/', '', $name), 0, 12)) ?: 'ROW';
        $code = "{$parentCode}.{$slug}";
        for ($n = 2; DB::table('statements')->where('code', $code)->exists() && $n < 100; $n++) {
            $code = "{$parentCode}.{$slug}{$n}";
        }
        abort_if(strlen($code) > 40, 422, 'That name makes the code too long. Use a shorter name.');

        return $code;
    }

    /** @return array<int, array> */
    private function tree(): array
    {
        $rows = DB::table('statements')->orderBy('sort_order')->orderBy('id')->get();
        $onGroups = DB::table('ledger_groups')->whereNotNull('statement_id')->selectRaw('statement_id as id, COUNT(*) as n')->groupBy('statement_id')->pluck('n', 'id')->all();
        $onLedgers = DB::table('ledgers')->whereNotNull('statement_id')->selectRaw('statement_id as id, COUNT(*) as n')->groupBy('statement_id')->pluck('n', 'id')->all();
        $children = [];
        foreach ($rows as $r) {
            $children[$r->parent_id ?? 0][] = $r;
        }
        $out = [];
        $walk = function ($parent, $depth) use (&$walk, &$out, $children, $onGroups, $onLedgers) {
            foreach ($children[$parent] ?? [] as $r) {
                $out[] = [
                    'id' => (int) $r->id, 'parent_id' => $r->parent_id ? (int) $r->parent_id : null, 'code' => $r->code, 'name' => $r->name, 'kind' => $r->kind,
                    'nature' => $r->nature, 'is_system' => (bool) $r->is_system, 'is_active' => (bool) $r->is_active, 'sort_order' => (int) $r->sort_order, 'depth' => $depth,
                    'groups' => (int) ($onGroups[$r->id] ?? 0), 'ledgers' => (int) ($onLedgers[$r->id] ?? 0),
                ];
                $walk($r->id, $depth + 1);
            }
        };
        $walk(0, 0);

        return $out;
    }
}
