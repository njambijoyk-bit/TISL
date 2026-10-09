<?php

namespace App\Services\Chat\Local;

use App\Models\MimiKbEntry;
use App\Models\MimiRouting;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;

/** Where the knowledge and the owner's switches live. The database wins when it has rows; until then the HTML file and config/mimi.php apply. */
final class KnowledgeStore
{
    public const CACHE_KEY = 'mimi_local_layer_version';

    public static function tablesExist(): bool
    {
        static $ok = null;
        try {
            return $ok ??= Schema::hasTable('mimi_kb_entries') && Schema::hasTable('mimi_kb_questions');
        } catch (\Throwable) {
            return $ok = false;
        }
    }

    public static function routingTableExists(): bool
    {
        static $ok = null;
        try {
            return $ok ??= Schema::hasTable('mimi_routing');
        } catch (\Throwable) {
            return $ok = false;
        }
    }

    /** A change here makes every worker rebuild its engine on the next question. */
    public static function touch(): void
    {
        Cache::forever(self::CACHE_KEY, microtime(true));
    }

    public static function version(): string
    {
        return (string) Cache::get(self::CACHE_KEY, '0');
    }

    /** @return Entry[]|null null when there is nothing in the database (so the file is used) */
    public static function entries(): ?array
    {
        if (! self::tablesExist() || ! MimiKbEntry::query()->exists()) {
            return null;
        }
        $out = [];
        foreach (MimiKbEntry::with('questions')->where('status', '!=', 'retired')->orderBy('entry_key')->get() as $r) {
            $out[] = self::toEntry($r);
        }

        return $out;
    }

    public static function toEntry(MimiKbEntry $r): Entry
    {
        $list = fn (?string $s): array => preg_split('/\s+/', trim((string) $s), -1, PREG_SPLIT_NO_EMPTY);

        return new Entry(
            id: $r->entry_key, title: $r->title, audience: $list($r->audience), requires: $list($r->requires), sensitivity: $r->sensitivity,
            resolver: (string) $r->resolver, keywords: (string) $r->keywords, follow: $list($r->follow),
            status: $r->status,
            reviewed: $r->status === 'live' ? ($r->reviewed_at?->toDateString() ?? 'live') : '',      // only live entries count as reviewed
            variants: $r->questions->map(fn ($q) => ['text' => $q->question, 'lang' => $q->lang])->all(),
            answer: (string) $r->answer_md, more: (string) $r->more_md, denied: (string) $r->denied_text, empty: (string) $r->empty_text,
        );
    }

    /** @return array{mode:string,fallback:string}|null */
    public static function routingFor(string $audience): ?array
    {
        if (! self::routingTableExists()) {
            return null;
        }
        $r = MimiRouting::find($audience);

        return $r ? ['mode' => (string) $r->mode, 'fallback' => (string) $r->fallback] : null;
    }
}
