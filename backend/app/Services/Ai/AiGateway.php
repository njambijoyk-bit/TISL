<?php

namespace App\Services\Ai;

use App\Models\AiProviderKey;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;

/**
 * One way to talk to any company's model. Keys are entered on the AI → Keys screen (stored encrypted) and chosen per purpose:
 *   analytics   the AI analytics modules
 *   mimi        the Mimi chat assistant
 *   screening   the careers application screening
 * Each key says which model it calls, optionally its own endpoint, what it may be used for, and where it comes in the order. A call tries the keys in order and moves to
 * the next when one fails in a way another might not (busy, over quota, a bad key, no connection), so one key running out never takes Mimi down.
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

    public const PURPOSES = ['analytics', 'mimi', 'screening'];

    /** A rough price per 1,000 tokens (in / out, USD) for the usage screen: an estimate, not a bill. */
    public const RATES = ['anthropic' => ['in' => 0.003, 'out' => 0.015], 'gemini' => ['in' => 0.000075, 'out' => 0.0003], 'openai' => ['in' => 0.00015, 'out' => 0.0006], 'qwen' => ['in' => 0.0004, 'out' => 0.0012]];

    public static function columns(): bool
    {
        static $ok = null;

        return $ok ??= Schema::hasColumn('ai_provider_keys', 'used_for');
    }

    public function modelOf(AiProviderKey $k): string
    {
        return $k->model ?: self::PROVIDERS[$k->provider]['model'] ?? '';
    }

    /** The keys in use for a purpose, first choice first. */
    public function keysFor(string $purpose): Collection
    {
        $q = AiProviderKey::active();
        if (self::columns()) {
            $q->whereIn('used_for', [$purpose, 'all'])->orderBy('priority');
        }

        return $q->orderBy('id')->get();
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
        $model = $this->modelOf($key);
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
     * Ask for a purpose: the keys in use are tried in order; one that fails in a way another might not is skipped (and its error kept on the screen).
     *
     * @return array the chat() result plus 'key' (the AiProviderKey used)
     *
     * @throws AiGatewayException  when no key is set up, or every key failed (the last error)
     */
    public function run(string $purpose, ?string $system, array $messages, array $opt = []): array
    {
        $keys = $this->keysFor($purpose);
        if ($keys->isEmpty()) {
            throw new AiGatewayException('No AI key is set up for ' . ($purpose === 'mimi' ? 'Mimi' : 'AI analytics') . ' yet. Add one under AI → Keys.', 0, false, 'none');
        }
        $last = null;
        foreach ($keys as $key) {
            try {
                $r = $this->chat($key, $system, $messages, $opt);
                $this->mark($key, null);

                return $r + ['key' => $key];
            } catch (AiGatewayException $e) {
                $this->mark($key, $e->getMessage());
                $last = $e;
                if (! $e->retryable && $e->kind !== 'key') {
                    throw $e;   // a bad request would fail on every key
                }
            }
        }

        throw $last ?? new AiGatewayException('No AI key worked.');
    }

    /** Remember how the last call went, so the screen can say why a key is not working. */
    private function mark(AiProviderKey $k, ?string $error): void
    {
        try {
            $k->forceFill(['last_used_at' => $error === null ? now() : $k->last_used_at]);
            if (self::columns()) {
                $k->forceFill(['last_error' => $error ? substr($error, 0, 250) : null, 'last_error_at' => $error ? now() : null]);
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
