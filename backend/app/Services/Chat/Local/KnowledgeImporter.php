<?php

namespace App\Services\Chat\Local;

use App\Models\MimiKbEntry;
use Illuminate\Support\Facades\DB;

/** Copies entries (from the HTML file) into the database. Existing keys are left alone unless forced, so an editor's changes are never overwritten by accident. */
final class KnowledgeImporter
{
    /** @return array{created:int,updated:int,skipped:int,problems:array<string,string[]>} */
    public function import(Knowledge $kb, bool $force = false, ?int $userId = null): array
    {
        $r = ['created' => 0, 'updated' => 0, 'skipped' => 0, 'problems' => []];
        $resolvers = ResolverRegistry::all();
        foreach ($kb->all() as $e) {
            if ($p = EntryLint::problems($e, $resolvers)) {
                $r['problems'][$e->id] = $p;
                continue;
            }
            $row = MimiKbEntry::where('entry_key', $e->id)->first();
            if ($row && ! $force) {
                $r['skipped']++;
                continue;
            }
            DB::transaction(function () use ($e, $row, $userId, &$r) {
                $data = $this->columns($e) + ['updated_by' => $userId];
                if ($row) {
                    $row->update($data + ['version' => $row->version + 1, 'status' => 'draft', 'reviewed_at' => null, 'reviewed_by' => null]);
                    $row->questions()->delete();
                    $r['updated']++;
                } else {
                    $row = MimiKbEntry::create($data + ['entry_key' => $e->id, 'status' => $e->reviewed !== '' ? 'live' : 'draft', 'reviewed_at' => $e->reviewed !== '' ? $e->reviewed : null]);
                    $r['created']++;
                }
                foreach ($e->variants as $i => $v) {
                    $row->questions()->create(['lang' => $v['lang'], 'question' => $v['text'], 'sort' => $i]);
                }
            });
        }
        KnowledgeStore::touch();

        return $r;
    }

    public function columns(Entry $e): array
    {
        return [
            'title' => $e->title, 'audience' => implode(' ', $e->audience), 'requires' => implode(' ', $e->requires) ?: null, 'sensitivity' => $e->sensitivity,
            'resolver' => $e->resolver ?: null, 'keywords' => $e->keywords ?: null, 'follow' => implode(' ', $e->follow) ?: null,
            'answer_md' => $e->answer, 'more_md' => $e->more ?: null, 'denied_text' => $e->denied ?: null, 'empty_text' => $e->empty ?: null,
        ];
    }
}
