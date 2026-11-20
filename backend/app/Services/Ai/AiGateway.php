<?php

namespace App\Services\Ai;

use App\Models\AiProviderKey;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;

/**
 * One way to talk to any company's model. Keys are entered on the AI → Keys screen (stored encrypted).
 *
 * Purposes (docs/AI_PURPOSES_SPEC.md): each kind of AI work is a purpose with its own line of keys, each place in the line with its own model. A purpose is
 * not a module: several modules' features can use one purpose (Projects weekly updates use `drafts`; another module's drafting can later too). A purpose
 * shows when any module that uses it is licensed, and a call says which module it comes from, so an unlicensed module is refused before any key is used.
 * Each key is open to all purposes or kept to some; a kept key is never used for another purpose. A call goes down its purpose's line, then any other key
 * allowed for it in the general order, and moves on when a key fails in a way another might not. A key that is over quota or refused rests for a while.
 * Every try is logged in ai_calls (never what was asked or answered). Before script 270 the keys' single "used for" is read, as it always was.
 * Providers: Anthropic (Claude), OpenAI (GPT), Google (Gemini), Alibaba (Qwen, through its OpenAI-compatible endpoint).
 */
class AiGateway
{
    public const PROVIDERS = [
        'anthropic' => ['label' => 'Anthropic', 'desc' => 'Claude models', 'model' => 'claude-sonnet-4-5', 'base' => 'https://api.anthropic.com',
            'models' => ['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-haiku-4-5']],
        'openai' => ['label' => 'OpenAI', 'desc' => 'GPT models', 'model' => 'gpt-4o-mini', 'base' => 'https://api.openai.com/v1',
            'models' => ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1', 'gpt-4.1-mini']],
        'gemini' => ['label' => 'Google Gemini', 'desc' => 'Gemini models', 'model' => 'gemini-2.5-flash', 'base' => 'https://generativelanguage.googleapis.com/v1beta',
            'models' => ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash']],
        'qwen' => ['label' => 'Qwen (Alibaba)', 'desc' => 'Qwen models', 'model' => 'qwen-plus', 'base' => 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
            'models' => ['qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen3-max']],
    ];

    /**
     * purpose => [name, what it is for, who reads the answer, features: feature => [what it is called, module (core = always licensed)]].
     * A new AI feature adds one line to the purpose it is, or one new purpose.
     */
    public const PURPOSES = [
        'mimi' => ['Mimi chat', 'Answers customers and staff when Mimi\'s own knowledge has no answer.', 'customers and staff', [
            'chat' => ['Mimi chat', 'core']]],
        'screening' => ['Applicant screening', 'Reads an applicant\'s CV and answers against the job.', 'HR (applicants\' personal data)', [
            'careers' => ['Careers application screening', 'careers']]],
        'analytics' => ['Page analysis', 'The AI analysis on module pages.', 'staff', [
            'page_analysis' => ['Page analysis', 'extras']]],
        'explain' => ['Explain in words', 'Turns figures already worked out into plain sentences.', 'staff', [
            'insight' => ['Insights: explain in words', 'core']]],
        'drafts' => ['Drafts', 'Drafts text that a person checks before it is sent.', 'whoever checks the draft, then its reader', [
            'projects_updates' => ['Projects weekly updates', 'projects']]],
    ];

    /** What the keys' single "used for" (script 67) maps to, before script 270 is run and when it moves the keys. */
    public const LEGACY = ['analytics' => ['analytics', 'explain', 'drafts'], 'mimi' => ['mimi'], 'screening' => ['screening']];

    /** A rough price per 1,000 tokens (in / out, USD) for the usage screen: an estimate, not a bill. */
    public const RATES = ['anthropic' => ['in' => 0.003, 'out' => 0.015], 'gemini' => ['in' => 0.000075, 'out' => 0.0003], 'openai' => ['in' => 0.00015, 'out' => 0.0006], 'qwen' => ['in' => 0.0004, 'out' => 0.0012]];

    private static ?bool $columns = null;

    private static ?bool $ready = null;

    public static function columns(): bool
    {
        return self::$columns ??= Schema::hasColumn('ai_provider_keys', 'used_for');
    }

    public function modelOf(AiProviderKey $k): string
    {
        return $k->model ?: self::PROVIDERS[$k->provider]['model'] ?? '';
    }

    /** Script 270 is run: purposes, lines, resting keys and the call log. */
    public static function ready(): bool
    {
        return self::$ready ??= Schema::hasTable('ai_calls') && Schema::hasColumn('ai_provider_keys', 'open_to_all');
    }

    /** The table checks are kept per process; tests (and a long-running worker after a script is run) start again. */
    public static function forget(): void
    {
        self::$columns = null;
        self::$ready = null;
    }

    /** Is a module licensed (switched on or off does not matter)? */
    public function licensed(string $module): bool
    {
        if ($module === 'core') {
            return true;
        }
        try {
            return app(\App\Services\Licensing\LicenseManager::class)->isLicensed($module);
        } catch (\Throwable) {
            return false;
        }
    }

    /** The purposes that show: those with at least one licensed module using them. @return array<string, array<string, mixed>> */
    public function purposes(): array
    {
        $out = [];
        foreach (self::PURPOSES as $key => [$name, $about, $readers, $features]) {
            $used = array_filter($features, fn ($f) => $this->licensed($f[1]));
            if ($used) {
                $out[$key] = ['key' => $key, 'name' => $name, 'about' => $about, 'readers' => $readers, 'used_by' => array_values(array_map(fn ($f) => $f[0], $used))];
            }
        }

        return $out;
    }

    /** May this purpose be used now, for this feature? (The feature's module must be licensed; with no feature, any of the purpose's modules.) */
    public function allowed(string $purpose, ?string $feature = null): bool
    {
        $features = self::PURPOSES[$purpose][3] ?? null;
        if ($features === null) {
            return false;
        }
        if ($feature !== null) {
            return isset($features[$feature]) && $this->licensed($features[$feature][1]);
        }

        return isset($this->purposes()[$purpose]);
    }

    /** May this key be used for this purpose? */
    public function keyServes(AiProviderKey $k, string $purpose): bool
    {
        if (! self::ready()) {
            return ! self::columns() || in_array($purpose, self::LEGACY[$k->used_for ?? 'all'] ?? [], true) || ($k->used_for ?? 'all') === 'all';
        }
        if ($k->open_to_all) {
            return true;
        }

        return \Illuminate\Support\Facades\DB::table('ai_key_purposes')->where('key_id', $k->id)->where('purpose', $purpose)->exists();
    }

    /**
     * The line a call for this purpose goes down: the purpose's own line first (each place with its model), then every other key allowed for it, in the
     * general order, with the key's own model. Keys switched off are left out; resting keys too unless $withResting.
     *
     * @return array<int, array{key: AiProviderKey, model: string, position: int, own: bool}>
     */
    public function lineFor(string $purpose, bool $withResting = false): array
    {
        $all = AiProviderKey::active()->orderByRaw(self::columns() ? 'priority, id' : 'id')->get();
        if (! self::ready()) {
            $n = 0;

            return $all->filter(fn ($k) => $this->keyServes($k, $purpose))->values()->map(fn ($k) => ['key' => $k, 'model' => $this->modelOf($k), 'position' => ++$n, 'own' => false])->all();
        }
        $kept = \Illuminate\Support\Facades\DB::table('ai_key_purposes')->where('purpose', $purpose)->pluck('key_id')->map(fn ($i) => (int) $i)->all();
        $serves = fn ($k) => $k->open_to_all || in_array((int) $k->id, $kept, true);
        $byId = $all->keyBy('id');
        $out = [];
        $seen = [];
        foreach (\Illuminate\Support\Facades\DB::table('ai_purpose_lines')->where('purpose', $purpose)->orderBy('position')->orderBy('id')->get() as $l) {
            $k = $byId[$l->key_id] ?? null;
            if ($k && $serves($k) && ! isset($seen[$k->id])) {
                $seen[$k->id] = true;
                $out[] = ['key' => $k, 'model' => $l->model ?: $this->modelOf($k), 'position' => 0, 'own' => true];
            }
        }
        foreach ($all as $k) {
            if ($serves($k) && ! isset($seen[$k->id])) {
                $seen[$k->id] = true;
                $out[] = ['key' => $k, 'model' => $this->modelOf($k), 'position' => 0, 'own' => false];
            }
        }
        if (! $withResting) {
            $out = array_values(array_filter($out, fn ($p) => ! $p['key']->resting_until || \Carbon\Carbon::parse($p['key']->resting_until)->isPast()));
        }
        foreach ($out as $i => $p) {
            $out[$i]['position'] = $i + 1;
        }

        return $out;
    }

    /** The keys in use for a purpose, first choice first. */
    public function keysFor(string $purpose): Collection
    {
        return collect($this->lineFor($purpose))->pluck('key');
    }

    // ── calling ────────────────────────────────────────────────────────────

    /**
     * Ask a model. $messages: [{role: user|assistant, content}], oldest first. $opt: max_tokens, temperature.
     *
     * @return array{text:string, prompt_tokens:int, completion_tokens:int, model:string, blocked:bool, provider:string}
     *
     * @throws AiGatewayException
     */
    public function chat(AiProviderKey $key, ?string $system, array $messages, array $opt = []): array
    {
        $messages = $this->tidy($messages);
        $model = ($opt['model'] ?? null) ?: $this->modelOf($key);
        $secret = $key->getDecryptedKey();
        $base = rtrim($key->base_url ?: self::PROVIDERS[$key->provider]['base'] ?? '', '/');
        $max = (int) ($opt['max_tokens'] ?? 1024);
        $temp = $opt['temperature'] ?? null;

        try {
            $http = Http::timeout((int) ($opt['timeout'] ?? 45))->acceptJson();
            $res = match ($key->provider) {
                'anthropic' => $http->withHeaders(['x-api-key' => $secret, 'anthropic-version' => '2023-06-01'])->post("{$base}/v1/messages",
                    array_filter(['model' => $model, 'max_tokens' => $max, 'system' => $system, 'temperature' => $temp, 'messages' => $messages], fn ($v) => $v !== null)),
                'openai', 'qwen' => $http->withToken($secret)->post("{$base}/chat/completions", array_filter([
                    'model' => $model, 'max_tokens' => $max, 'temperature' => $temp,
                    'messages' => array_merge($system ? [['role' => 'system', 'content' => $system]] : [], $messages)], fn ($v) => $v !== null)),
                'gemini' => $http->withHeaders(['x-goog-api-key' => $secret])->post("{$base}/models/{$model}:generateContent", array_filter([
                    'system_instruction' => $system ? ['parts' => [['text' => $system]]] : null,
                    'contents' => array_map(fn ($m) => ['role' => $m['role'] === 'assistant' ? 'model' : 'user', 'parts' => [['text' => $m['content']]]], $messages),
                    'generationConfig' => array_filter(['maxOutputTokens' => $max, 'temperature' => $temp], fn ($v) => $v !== null)], fn ($v) => $v !== null)),
                default => throw new AiGatewayException("Unsupported provider: {$key->provider}", 0, false, 'config'),
            };
        } catch (ConnectionException $e) {
            throw new AiGatewayException('Could not reach ' . (self::PROVIDERS[$key->provider]['label'] ?? $key->provider) . '.', 0, true, 'connection');
        }

        if ($res->failed()) {
            $s = $res->status();
            $msg = $res->json('error.message') ?? $res->json('error') ?? $res->json('message') ?? substr($res->body(), 0, 200);
            $msg = is_array($msg) ? json_encode($msg) : (string) $msg;
            $kind = $s === 429 ? 'quota' : (in_array($s, [401, 403], true) ? 'key' : ($s >= 500 ? 'server' : 'error'));
            throw new AiGatewayException(trim((self::PROVIDERS[$key->provider]['label'] ?? $key->provider) . " said: {$msg}"), $s, $kind !== 'error', $kind);
        }

        return $this->read($key->provider, $res->json() ?? [], $model);
    }

    /** Anthropic wants the conversation to start with the user and alternate; join neighbours of the same role and drop leading assistant turns. */
    private function tidy(array $messages): array
    {
        $out = [];
        foreach ($messages as $m) {
            $text = trim((string) ($m['content'] ?? ''));
            if ($text === '') {
                continue;
            }
            $role = ($m['role'] ?? 'user') === 'assistant' ? 'assistant' : 'user';
            if ($out && end($out)['role'] === $role) {
                $out[count($out) - 1]['content'] .= "\n\n" . $text;
            } else {
                $out[] = ['role' => $role, 'content' => $text];
            }
        }
        while ($out && $out[0]['role'] === 'assistant') {
            array_shift($out);
        }

        return $out;
    }

    private function read(string $provider, array $d, string $model): array
    {
        $blocked = false;
        if ($provider === 'anthropic') {
            $text = collect($d['content'] ?? [])->where('type', 'text')->pluck('text')->implode('');
            $in = $d['usage']['input_tokens'] ?? 0;
            $out = $d['usage']['output_tokens'] ?? 0;
            $blocked = ($d['stop_reason'] ?? null) === 'refusal';
            $model = $d['model'] ?? $model;
        } elseif ($provider === 'gemini') {
            $text = collect($d['candidates'][0]['content']['parts'] ?? [])->pluck('text')->implode('');
            $in = $d['usageMetadata']['promptTokenCount'] ?? 0;
            $out = $d['usageMetadata']['candidatesTokenCount'] ?? 0;
            $blocked = ($d['candidates'][0]['finishReason'] ?? null) === 'SAFETY' || ! empty($d['promptFeedback']['blockReason']);
        } else {   // openai, qwen
            $text = $d['choices'][0]['message']['content'] ?? '';
            $in = $d['usage']['prompt_tokens'] ?? 0;
            $out = $d['usage']['completion_tokens'] ?? 0;
            $blocked = ($d['choices'][0]['finish_reason'] ?? null) === 'content_filter';
            $model = $d['model'] ?? $model;
        }

        return ['text' => trim((string) $text), 'prompt_tokens' => (int) $in, 'completion_tokens' => (int) $out, 'model' => $model, 'blocked' => $blocked, 'provider' => $provider];
    }

    /**
     * Ask for a purpose: down its line, moving on when a key fails in a way another might not; a key that is over quota or refused rests.
     * $opt: max_tokens, temperature, timeout, and `feature` (the feature asking, from the purpose's list; its module must be licensed).
     *
     * @return array the chat() result plus 'key' (the AiProviderKey used) and 'position' (its place in the line)
     *
     * @throws AiGatewayException  when the purpose may not be used, no key is set up, or every key failed (the last error)
     */
    public function run(string $purpose, ?string $system, array $messages, array $opt = []): array
    {
        $name = self::PURPOSES[$purpose][0] ?? $purpose;
        if (! isset(self::PURPOSES[$purpose])) {
            throw new AiGatewayException("Unknown AI purpose: {$purpose}", 0, false, 'config');
        }
        if (! $this->allowed($purpose, $opt['feature'] ?? null)) {
            $this->log($purpose, null, null, 0, 'refused', 'Not licensed');
            throw new AiGatewayException("{$name} is not available: the module it is for is not licensed.", 0, false, 'licence');
        }
        if ($why = app(AiLimits::class)->stopped($purpose)) {
            $this->log($purpose, null, null, 0, 'refused', $why);
            throw new AiGatewayException($why, 0, false, 'limit');
        }
        $line = $this->lineFor($purpose);
        if (! $line) {
            $resting = $this->lineFor($purpose, true);
            throw new AiGatewayException($resting ? "Every AI key for {$name} is resting after being refused. Try again later, or test a key on AI → Keys." : "No AI key is set up for {$name} yet. Add one under AI → Keys.", 0, false, 'none');
        }
        $last = null;
        foreach ($line as $place) {
            $key = $place['key'];
            $t = microtime(true);
            try {
                $r = $this->chat($key, $system, $messages, ['model' => $place['model']] + $opt);
                $this->mark($key, null);
                $this->log($purpose, $key, $r, (int) ((microtime(true) - $t) * 1000), 'ok', null, $place['position']);
                app(AiLimits::class)->check($purpose);

                return $r + ['key' => $key, 'position' => $place['position']];
            } catch (AiGatewayException $e) {
                $this->mark($key, $e->getMessage(), $this->rests($e));
                $this->log($purpose, $key, ['model' => $place['model'], 'provider' => $key->provider], (int) ((microtime(true) - $t) * 1000), 'failed', $e->getMessage(), $place['position']);
                $last = $e;
                if (! $e->retryable && $e->kind !== 'key') {
                    throw $e;   // a bad request would fail on every key
                }
            }
        }

        throw $last ?? new AiGatewayException('No AI key worked.');
    }

    /** Over quota, out of credit or a refused key rests; busy, a timeout or a server error does not. */
    public function rests(AiGatewayException $e): bool
    {
        return $e->kind === 'key' || ($e->kind === 'quota' && preg_match('/quota|credit|billing|insufficient|exceeded your|balance/i', $e->getMessage()));
    }

    public function restMinutes(): int
    {
        return self::ready() ? (int) (\Illuminate\Support\Facades\DB::table('ai_gateway_settings')->value('rest_minutes') ?? 10) : 0;
    }

    /** One row per try. Never what was asked or answered. */
    private function log(string $purpose, ?AiProviderKey $key, ?array $r, int $ms, string $outcome, ?string $error, int $position = 0): void
    {
        if (! self::ready()) {
            return;
        }
        try {
            $in = (int) ($r['prompt_tokens'] ?? 0);
            $out = (int) ($r['completion_tokens'] ?? 0);
            \Illuminate\Support\Facades\DB::table('ai_calls')->insert(['purpose' => $purpose, 'key_id' => $key?->id, 'provider' => $key?->provider, 'model' => isset($r['model']) ? mb_substr((string) $r['model'], 0, 80) : null,
                'prompt_tokens' => $in, 'completion_tokens' => $out, 'cost_estimate' => $key ? $this->estimateCost($key->provider, $in, $out) : 0, 'ms' => $ms, 'position' => $position,
                'outcome' => $outcome, 'error' => $error ? mb_substr($error, 0, 255) : null, 'created_at' => now()]);
        } catch (\Throwable) {
            // the log must never fail the call
        }
    }

    /** Remember how the last call went, so the screen can say why a key is not working. */
    private function mark(AiProviderKey $k, ?string $error, bool $rest = false): void
    {
        try {
            $k->forceFill(['last_used_at' => $error === null ? now() : $k->last_used_at]);
            if (self::columns()) {
                $k->forceFill(['last_error' => $error ? substr($error, 0, 250) : null, 'last_error_at' => $error ? now() : null]);
            }
            if (self::ready() && ($error === null || $rest)) {
                $minutes = $this->restMinutes();
                $k->forceFill($error === null || $minutes === 0 ? ['resting_until' => null, 'rest_reason' => null] : ['resting_until' => now()->addMinutes($minutes), 'rest_reason' => substr($error, 0, 250)]);
            }
            $k->save();
        } catch (\Throwable) {
            // a bookkeeping failure must never fail the call
        }
    }

    public function estimateCost(string $provider, int $in, int $out): float
    {
        $r = self::RATES[$provider] ?? ['in' => 0, 'out' => 0];

        return round($in / 1000 * $r['in'] + $out / 1000 * $r['out'], 6);
    }
}
