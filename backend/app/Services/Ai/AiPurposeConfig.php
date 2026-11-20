<?php

namespace App\Services\Ai;

use App\Models\AiProviderKey;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The AI → Keys screen's side of purposes (docs/AI_PURPOSES_SPEC.md, build A.2): which purposes a key is kept to, each purpose's line with a model
 * per place, how long a refused key rests, and testing a purpose down its line. Only purposes that show (a licensed module uses them) can be changed;
 * what is set for a hidden purpose is kept as it was.
 */
class AiPurposeConfig
{
    public function __construct(private AiGateway $gw) {}

    /** @return array<string, mixed> */
    public function overview(): array
    {
        $ready = AiGateway::ready();
        $purposes = [];
        foreach ($this->gw->purposes() as $key => $p) {
            $line = $ready ? $this->gw->lineFor($key, true) : [];
            $purposes[] = $p + [
                'line' => array_map(fn ($x) => ['key_id' => (int) $x['key']->id, 'label' => $x['key']->label, 'provider' => $x['key']->provider, 'model' => $x['model'], 'position' => $x['position'], 'own' => $x['own'],
                    'resting_until' => $x['key']->resting_until?->toIso8601String()], $line),
                'own_line' => $ready ? DB::table('ai_purpose_lines')->where('purpose', $key)->orderBy('position')->get(['key_id', 'model'])->map(fn ($l) => ['key_id' => (int) $l->key_id, 'model' => $l->model])->all() : [],
            ];
        }

        return ['ready' => $ready, 'purposes' => $purposes, 'rest_minutes' => $this->gw->restMinutes()];
    }

    /** What a key is kept to, among the purposes that show. @return string[] */
    public function keptTo(AiProviderKey $k): array
    {
        if (! AiGateway::ready()) {
            return AiGateway::LEGACY[$k->used_for ?? 'all'] ?? [];
        }

        return DB::table('ai_key_purposes')->where('key_id', $k->id)->whereIn('purpose', array_keys($this->gw->purposes()))->orderBy('purpose')->pluck('purpose')->all();
    }

    /** Open to all, or kept to these purposes. Purposes that are hidden now keep what they had. */
    public function saveKeyPurposes(AiProviderKey $k, bool $open, array $kept): void
    {
        if (! AiGateway::ready()) {
            return;
        }
        $shown = array_keys($this->gw->purposes());
        $kept = array_values(array_unique(array_intersect($kept, $shown)));
        if (! $open && ! $kept && ! DB::table('ai_key_purposes')->where('key_id', $k->id)->whereNotIn('purpose', $shown)->exists()) {
            throw ValidationException::withMessages(['kept_to' => 'Tick at least one purpose, or make the key open to all.']);
        }
        DB::transaction(function () use ($k, $open, $kept, $shown) {
            $k->forceFill(['open_to_all' => $open])->save();
            DB::table('ai_key_purposes')->where('key_id', $k->id)->whereIn('purpose', $shown)->delete();
            foreach ($kept as $p) {
                DB::table('ai_key_purposes')->insert(['key_id' => $k->id, 'purpose' => $p, 'created_at' => now()]);
            }
            if (! $open) {   // a key that no longer serves a purpose leaves that purpose's line
                DB::table('ai_purpose_lines')->where('key_id', $k->id)->whereIn('purpose', array_diff($shown, $kept))->delete();
            }
        });
    }

    /** A purpose's own line, first choice first: [{key_id, model}]. An empty list removes the line (the keys allowed for it are used in the general order). */
    public function saveLine(string $purpose, array $items, User $by): void
    {
        $this->needReady();
        isset($this->gw->purposes()[$purpose]) || throw ValidationException::withMessages(['purpose' => 'That purpose is not available.']);
        $rows = [];
        foreach (array_values($items) as $i => $it) {
            $k = AiProviderKey::find((int) ($it['key_id'] ?? 0)) ?? throw ValidationException::withMessages(['line' => 'Choose keys from the list.']);
            $this->gw->keyServes($k, $purpose) || throw ValidationException::withMessages(['line' => "\"{$k->label}\" is kept to other purposes. Tick this purpose on the key first."]);
            isset($rows[$k->id]) && throw ValidationException::withMessages(['line' => "\"{$k->label}\" is in the line twice. Use one place per key."]);
            $model = trim((string) ($it['model'] ?? ''));
            strlen($model) <= 80 || throw ValidationException::withMessages(['line' => 'A model name is at most 80 characters.']);
            $rows[$k->id] = ['purpose' => $purpose, 'key_id' => $k->id, 'position' => $i + 1, 'model' => $model !== '' ? $model : null, 'updated_by' => $by->id, 'created_at' => now(), 'updated_at' => now()];
        }
        DB::transaction(function () use ($purpose, $rows) {
            DB::table('ai_purpose_lines')->where('purpose', $purpose)->delete();
            DB::table('ai_purpose_lines')->insert(array_values($rows));
        });
    }

    public function setRest(int $minutes, User $by): void
    {
        $this->needReady();
        ($minutes >= 0 && $minutes <= 1440) || throw ValidationException::withMessages(['rest_minutes' => 'A rest is from 0 (never) to 1,440 minutes.']);
        DB::table('ai_gateway_settings')->updateOrInsert(['id' => 1], ['rest_minutes' => $minutes, 'updated_by' => $by->id, 'updated_at' => now()]);
    }

    /** Send a one-word test down the purpose's line, as a real call would go: which key answered, at which place, and what failed before it. */
    public function test(string $purpose): array
    {
        $p = $this->gw->purposes()[$purpose] ?? throw ValidationException::withMessages(['purpose' => 'That purpose is not available.']);
        $before = AiGateway::ready() ? (int) DB::table('ai_calls')->max('id') : 0;
        $feature = collect(AiGateway::PURPOSES[$purpose][3])->filter(fn ($f) => $this->gw->licensed($f[1]))->keys()->first();
        $t = microtime(true);
        try {
            $r = $this->gw->run($purpose, null, [['role' => 'user', 'content' => 'Reply with the single word: OK']], ['max_tokens' => 20, 'timeout' => 20, 'feature' => $feature]);
            $out = ['ok' => true, 'key' => $r['key']->label, 'model' => $r['model'], 'position' => $r['position'], 'reply' => $r['text']];
        } catch (AiGatewayException $e) {
            $out = ['ok' => false, 'message' => $e->getMessage()];
        }
        $out['ms'] = (int) ((microtime(true) - $t) * 1000);
        $out['failed'] = AiGateway::ready() ? DB::table('ai_calls as c')->leftJoin('ai_provider_keys as k', 'k.id', '=', 'c.key_id')->where('c.id', '>', $before)->where('c.outcome', 'failed')->orderBy('c.id')
            ->get(['k.label', 'c.error'])->map(fn ($f) => ['key' => $f->label, 'error' => $f->error])->all() : [];

        return $out + ['purpose' => $p['name']];
    }

    /** Remove what points at a key that is deleted. */
    public function forgetKey(int $keyId): void
    {
        if (AiGateway::ready()) {
            DB::table('ai_key_purposes')->where('key_id', $keyId)->delete();
            DB::table('ai_purpose_lines')->where('key_id', $keyId)->delete();
        }
    }

    private function needReady(): void
    {
        AiGateway::ready() || throw ValidationException::withMessages(['purpose' => 'Run database script 270_ai_purposes.sql first.']);
    }
}
