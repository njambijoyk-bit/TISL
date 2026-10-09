<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\MimiKbEntry;
use App\Models\MimiQueryLog;
use App\Models\MimiRouting;
use App\Services\Access\Catalog;
use App\Services\Chat\Local\CallerContext;
use App\Services\Chat\Local\Entry;
use App\Services\Chat\Local\EntryLint;
use App\Services\Chat\Local\Knowledge;
use App\Services\Chat\Local\KnowledgeImporter;
use App\Services\Chat\Local\KnowledgeStore;
use App\Services\Chat\Local\LocalLayer;
use App\Services\Chat\Local\ResolverRegistry;
use App\Services\Chat\Local\Slots;
use App\Services\Chat\Local\Redactor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** The knowledge Mimi answers from, the questions she could not answer, and the owner's switches (docs/MIMI_LOCAL_LAYER_GUIDE.html). */
class MimiKnowledgeController extends Controller
{
    public function __construct(private readonly LocalLayer $local, private readonly KnowledgeImporter $importer) {}

    // ── what the editor needs to build its pickers ─────────────────────────────

    public function meta(): JsonResponse
    {
        $perms = [];
        foreach (Catalog::PERMISSIONS as $key => [$module, $group, $label]) {
            $perms[] = ['key' => $key, 'group' => $group, 'label' => $label];
        }
        $resolvers = [];
        foreach (ResolverRegistry::all() as $name => $r) {
            $resolvers[] = ['name' => $name, 'requires' => $r->requires(), 'kinds' => $r->kinds(), 'needs' => $r->needs()];
        }

        return response()->json([
            'permissions' => $perms, 'resolvers' => $resolvers, 'kinds' => EntryLint::KINDS,
            'source' => KnowledgeStore::tablesExist() && MimiKbEntry::query()->exists() ? 'database' : 'file',
            'tables_ready' => KnowledgeStore::tablesExist(), 'logs_ready' => $this->logsReady(),
            'thresholds' => config('mimi.thresholds'), 'allow_drafts' => (bool) config('mimi.allow_drafts'),
        ]);
    }

    // ── entries ────────────────────────────────────────────────────────────────

    public function index(Request $request): JsonResponse
    {
        if (! KnowledgeStore::tablesExist() || ! MimiKbEntry::query()->exists()) {
            // nothing in the database yet: show what Mimi is reading from the file, read only, ready to import
            $kb = Knowledge::fromFile((string) config('mimi.knowledge'));

            return response()->json(['source' => 'file', 'data' => array_map(fn (Entry $e) => $this->fromEntry($e), $kb->all())]);
        }
        $rows = MimiKbEntry::with('questions')->orderBy('entry_key')->get();

        return response()->json(['source' => 'database', 'data' => $rows->map(fn ($r) => $this->present($r))->all()]);
    }

    public function import(Request $request): JsonResponse
    {
        abort_unless(KnowledgeStore::tablesExist(), 422, 'Run database/sql/105_mimi_local_layer.sql first.');
        $r = $this->importer->import(Knowledge::fromFile((string) config('mimi.knowledge')), (bool) $request->boolean('force'), $request->user()->id);

        return response()->json($r);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless(KnowledgeStore::tablesExist(), 422, 'Run database/sql/105_mimi_local_layer.sql first.');
        $entry = $this->entryFrom($request, null);
        $this->lintOrFail($entry);
        abort_if(MimiKbEntry::where('entry_key', $entry->id)->exists(), 422, "An entry with the key {$entry->id} already exists. Keys are never reused.");

        $row = DB::transaction(function () use ($entry, $request) {
            $row = MimiKbEntry::create($this->importer->columns($entry) + ['entry_key' => $entry->id, 'status' => 'draft', 'updated_by' => $request->user()->id]);
            $this->saveQuestions($row, $entry);

            return $row;
        });
        KnowledgeStore::touch();

        return response()->json($this->present($row->load('questions')), 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $row = MimiKbEntry::findOrFail($id);
        $entry = $this->entryFrom($request, $row->entry_key);       // the key never changes
        $this->lintOrFail($entry);

        DB::transaction(function () use ($row, $entry, $request) {
            // any change to a live entry sends it back for review: nobody's edit goes live unchecked
            $row->update($this->importer->columns($entry) + [
                'updated_by' => $request->user()->id, 'version' => $row->version + 1,
                'status' => $row->status === 'retired' ? 'retired' : 'draft', 'reviewed_at' => null, 'reviewed_by' => null,
            ]);
            $row->questions()->delete();
            $this->saveQuestions($row, $entry);
        });
        KnowledgeStore::touch();

        return response()->json($this->present($row->load('questions')));
    }

    /** Someone other than the last editor signs the wording off (the owner may sign off their own). */
    public function review(Request $request, int $id): JsonResponse
    {
        $row = MimiKbEntry::with('questions')->findOrFail($id);
        $me = $request->user();
        abort_if($row->updated_by === $me->id && ! $me->hasPermission('mimi.routing'), 403, 'Someone else needs to review this: you made the last change.');
        $this->lintOrFail(KnowledgeStore::toEntry($row));
        $row->update(['status' => 'live', 'reviewed_at' => now(), 'reviewed_by' => $me->id]);
        KnowledgeStore::touch();

        return response()->json($this->present($row->refresh()->load('questions')));
    }

    /** A draft is deleted; anything that has been live is retired (kept, never served, and its key stays taken). */
    public function destroy(int $id): JsonResponse
    {
        $row = MimiKbEntry::findOrFail($id);
        if ($row->status === 'draft' && ! $row->reviewed_at) {
            $row->questions()->delete();
            $row->delete();
        } else {
            $row->update(['status' => 'retired']);
        }
        KnowledgeStore::touch();

        return response()->json(['ok' => true]);
    }

    /** Ask the real engine a question as a made-up caller. Live data is not fetched here (there is no real user), so resolver answers show what would be asked. */
    public function tryIt(Request $request): JsonResponse
    {
        $v = $request->validate(['message' => 'required|string|max:500', 'kind' => 'required|in:' . implode(',', EntryLint::KINDS), 'permissions' => 'array', 'permissions.*' => 'string']);
        $ctx = CallerContext::fake($v['kind'], array_values(array_intersect($v['permissions'] ?? [], array_keys(Catalog::PERMISSIONS))));
        $a = $this->local->answer($ctx, $v['message']);

        return response()->json(['outcome' => $a->outcome, 'entry' => $a->entry?->id, 'confidence' => round($a->confidence, 3), 'text' => $a->text,
            'suggestions' => $a->suggestions, 'resolver' => $a->resolver, 'ms' => round($a->ms, 1), 'unknown' => round($a->unknownShare, 2)]);
    }

    // ── what could not be answered ─────────────────────────────────────────────

    /** Questions the local layer did not settle (shadow mode included), most asked first, with emails, phones and references blanked. */
    public function gaps(Request $request): JsonResponse
    {
        if (! $this->logsReady()) {
            return response()->json(['ready' => false, 'data' => [], 'summary' => null]);
        }
        $days = max(1, min(90, (int) $request->query('days', 30)));
        $since = now()->subDays($days);
        $base = MimiQueryLog::query()->where('queried_at', '>=', $since)->whereNotNull('local_outcome');

        $summary = (clone $base)->select('local_outcome', DB::raw('COUNT(*) as n'))->groupBy('local_outcome')->pluck('n', 'local_outcome')->all();
        $total = array_sum($summary);

        $red = new Redactor;
        $slots = $this->local->slots();
        $rows = (clone $base)->whereIn('local_outcome', ['none', 'suggest'])->where('is_harmful', false)
            ->select('query', 'local_outcome', 'kb_entry', DB::raw('MAX(confidence) as confidence'), DB::raw('COUNT(*) as asked'), DB::raw('MAX(queried_at) as last_asked'))
            ->groupBy('query', 'local_outcome', 'kb_entry')->orderByDesc('asked')->limit(200)->get();

        $grouped = [];
        foreach ($rows as $r) {
            $q = trim($red->redact((string) $r->query, $slots)['text']);
            $k = mb_strtolower($q);
            $grouped[$k] ??= ['question' => $q, 'asked' => 0, 'outcome' => $r->local_outcome, 'nearest' => $r->kb_entry, 'confidence' => (float) $r->confidence, 'last_asked' => $r->last_asked];
            $grouped[$k]['asked'] += (int) $r->asked;
        }
        usort($grouped, fn ($a, $b) => $b['asked'] <=> $a['asked']);

        return response()->json(['ready' => true, 'days' => $days, 'summary' => ['total' => $total, 'by_outcome' => $summary,
            'local_share' => $total ? round(100 * (($summary['answer'] ?? 0) + ($summary['empty'] ?? 0) + ($summary['ask'] ?? 0) + ($summary['restricted'] ?? 0)) / $total, 1) : null],
            'data' => array_slice(array_values($grouped), 0, 100)]);
    }

    // ── the owner's switches ───────────────────────────────────────────────────

    public function routing(): JsonResponse
    {
        $out = [];
        $rows = KnowledgeStore::routingTableExists() ? MimiRouting::all()->keyBy('audience') : collect();
        foreach (['guest', 'customer', 'staff', 'other'] as $a) {
            $r = $rows->get($a);
            $out[] = ['audience' => $a, 'mode' => $r->mode ?? config('mimi.mode'), 'fallback' => $r->fallback ?? config("mimi.fallback.{$a}"), 'from_database' => (bool) $r];
        }

        return response()->json(['ready' => KnowledgeStore::routingTableExists(), 'data' => $out]);
    }

    public function updateRouting(Request $request): JsonResponse
    {
        abort_unless(KnowledgeStore::routingTableExists(), 422, 'Run database/sql/105_mimi_local_layer.sql first.');
        $v = $request->validate(['rows' => 'required|array|min:1', 'rows.*.audience' => 'required|in:guest,customer,staff,other',
            'rows.*.mode' => 'required|in:off,shadow,on', 'rows.*.fallback' => 'required|in:local_only,ai_public,ai_scoped']);
        foreach ($v['rows'] as $r) {
            // staff and other accounts are never above ai_public: the old full prompt holds other people's data
            abort_if($r['fallback'] === 'ai_scoped' && ! in_array($r['audience'], ['guest', 'customer'], true), 422, 'Only guests and customers can use the full (scoped) prompt.');
            MimiRouting::updateOrCreate(['audience' => $r['audience']], ['mode' => $r['mode'], 'fallback' => $r['fallback'], 'updated_by' => $request->user()->id, 'updated_at' => now()]);
        }
        KnowledgeStore::touch();

        return $this->routing();
    }

    // ── helpers ────────────────────────────────────────────────────────────────

    private function logsReady(): bool
    {
        try {
            return Schema::hasColumn('mimi_query_logs', 'local_outcome');
        } catch (\Throwable) {
            return false;
        }
    }

    private function entryFrom(Request $request, ?string $fixedKey): Entry
    {
        $v = $request->validate([
            'entry_key' => $fixedKey ? 'nullable|string' : 'required|string|max:80',
            'title' => 'required|string|max:200', 'audience' => 'required|array|min:1', 'audience.*' => 'string',
            'requires' => 'array', 'requires.*' => 'string', 'sensitivity' => 'required|string', 'resolver' => 'nullable|string|max:60',
            'keywords' => 'nullable|string|max:2000', 'follow' => 'array', 'follow.*' => 'string',
            'answer_md' => 'required|string|max:8000', 'more_md' => 'nullable|string|max:4000',
            'denied_text' => 'nullable|string|max:400', 'empty_text' => 'nullable|string|max:400',
            'questions' => 'required|array|min:1', 'questions.*.question' => 'required|string|max:300', 'questions.*.lang' => 'nullable|string|max:5',
        ]);

        return new Entry(
            id: $fixedKey ?? trim($v['entry_key']), title: trim($v['title']), audience: array_values($v['audience']), requires: array_values($v['requires'] ?? []),
            sensitivity: $v['sensitivity'], resolver: (string) ($v['resolver'] ?? ''), keywords: trim((string) ($v['keywords'] ?? '')), follow: array_values($v['follow'] ?? []),
            status: '', reviewed: '',
            variants: array_map(fn ($q) => ['text' => trim($q['question']), 'lang' => ($q['lang'] ?? null) ?: 'en'], $v['questions']),
            answer: trim($v['answer_md']), more: trim((string) ($v['more_md'] ?? '')), denied: trim((string) ($v['denied_text'] ?? '')), empty: trim((string) ($v['empty_text'] ?? '')),
        );
    }

    private function lintOrFail(Entry $e): void
    {
        $p = EntryLint::problems($e, ResolverRegistry::all());
        if ($p) {
            abort(response()->json(['message' => 'This entry breaks a rule.', 'errors' => ['entry' => $p]], 422));
        }
    }

    private function saveQuestions(MimiKbEntry $row, Entry $e): void
    {
        foreach ($e->variants as $i => $q) {
            $row->questions()->create(['lang' => $q['lang'], 'question' => $q['text'], 'sort' => $i]);
        }
    }

    private function present(MimiKbEntry $r): array
    {
        return $this->fromEntry(KnowledgeStore::toEntry($r->loadMissing('questions'))) + [
            'id' => $r->id, 'status' => $r->status, 'version' => $r->version, 'reviewed_at' => $r->reviewed_at?->toDateTimeString(), 'updated_at' => $r->updated_at?->toDateTimeString(),
            'editable' => true,
        ];
    }

    private function fromEntry(Entry $e): array
    {
        return ['entry_key' => $e->id, 'title' => $e->title, 'audience' => $e->audience, 'requires' => $e->requires, 'sensitivity' => $e->sensitivity, 'resolver' => $e->resolver,
            'keywords' => $e->keywords, 'follow' => $e->follow, 'answer_md' => $e->answer, 'more_md' => $e->more, 'denied_text' => $e->denied, 'empty_text' => $e->empty,
            'questions' => array_map(fn ($v) => ['question' => $v['text'], 'lang' => $v['lang']], $e->variants), 'status' => $e->reviewed !== '' ? 'live' : 'draft', 'editable' => false];
    }
}
