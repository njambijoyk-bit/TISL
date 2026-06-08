<?php

namespace App\Jobs;

use App\Models\Application;
use App\Models\AiProviderKey;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class ScreenApplicationJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries   = 3;
    public int $timeout = 180;
    public int $backoff = 30;

    public function __construct(public readonly int $applicationId) {}

    public function handle(): void
    {
        $application = Application::with(['applicant', 'jobPosting', 'documents'])
            ->find($this->applicationId);

        if (!$application) {
            Log::warning('ScreenApplicationJob: application not found', ['id' => $this->applicationId]);
            return;
        }

        if ($application->hasBeenScreened()) {
            return;
        }

        try {
            $resolved = $this->resolveKey();
            $prompt   = $this->buildPrompt($application);
            $result   = $this->callProvider($resolved, $prompt);

            $application->update([
                'ai_score'          => $result['score']          ?? null,
                'ai_summary'        => $result['summary']        ?? null,
                'ai_strengths'      => $result['strengths']      ?? [],
                'ai_gaps'           => $result['gaps']           ?? [],
                'ai_recommendation' => $result['recommendation'] ?? null,
                'ai_screened_at'    => now(),
            ]);

            Log::info('Application screened', [
                'application_id' => $application->id,
                'provider'       => $resolved['provider'],
                'score'          => $result['score'] ?? null,
            ]);

        } catch (\Exception $e) {
            Log::error('ScreenApplicationJob failed', [
                'application_id' => $this->applicationId,
                'error'          => $e->getMessage(),
            ]);
            throw $e;
        }
    }

    private function resolveKey(): array
    {
        $key = env('ANTHROPIC_API_KEY');

        if (!$key) {
            throw new \RuntimeException('ANTHROPIC_API_KEY not set in .env');
        }

        $provider = match(true) {
            str_starts_with($key, 'sk-ant-')                          => 'anthropic',
            str_starts_with($key, 'sk-proj-'), 
            str_starts_with($key, 'sk-')                              => 'openai',
            str_starts_with($key, 'AI') || str_starts_with($key, 'AQ.') => 'gemini',
            preg_match('/^[a-f0-9-]{36}$/i', $key)                   => 'cohere',
            default                                                    => 'mistral',
        };

        return ['key' => $key, 'provider' => $provider];
    }

    // ── Active key ────────────────────────────────────────────────────────────

    private function getApiKey(): string
    {
        $key = env('GEMINI_API_KEY');
        if (!$key) throw new \RuntimeException('GEMINI_API_KEY not set in .env');
        return $key;
    }

    // ── Route to provider ─────────────────────────────────────────────────────

    private function callProvider(array $resolved, string $prompt): array
    {
        return match ($resolved['provider']) {
            'anthropic' => $this->callAnthropic($resolved['key'], $prompt),
            'gemini'    => $this->callGemini($resolved['key'], $prompt),
            'openai'    => $this->callOpenAI($resolved['key'], $prompt),
            'mistral'   => $this->callMistral($resolved['key'], $prompt),
            'cohere'    => $this->callCohere($resolved['key'], $prompt),
            default     => throw new \RuntimeException("Unknown provider"),
        };
    }

    // ── Provider calls ────────────────────────────────────────────────────────

    private function callAnthropic(string $apiKey, string $prompt): array
    {
        $response = Http::withHeaders([
            'x-api-key'         => $apiKey,
            'anthropic-version' => '2023-06-01',
            'content-type'      => 'application/json',
        ])->timeout(45)->post('https://api.anthropic.com/v1/messages', [
            'model'      => 'claude-sonnet-4-20250514',
            'max_tokens' => 1024,
            'messages'   => [['role' => 'user', 'content' => $prompt]],
        ]);

        if (!$response->successful()) {
            throw new \RuntimeException('Anthropic API error: ' . $response->status() . ' ' . $response->body());
        }

        return $this->parseJson($response->json('content.0.text') ?? '');
    }

    private function callGemini(string $apiKey, string $prompt): array
    {
        $model    = 'gemini-2.5-flash';
        $response = Http::timeout(45)->post(
            "https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent?key={$apiKey}",
            ['contents' => [['parts' => [['text' => $prompt]]]]]
        );

        if (!$response->successful()) {
            throw new \RuntimeException('Gemini API error: ' . $response->status() . ' ' . $response->body());
        }

        return $this->parseJson(
            $response->json('candidates.0.content.parts.0.text') ?? ''
        );
    }

    private function callOpenAI(string $apiKey, string $prompt): array
    {
        $response = Http::withHeaders([
            'Authorization' => "Bearer {$apiKey}",
            'Content-Type'  => 'application/json',
        ])->timeout(45)->post('https://api.openai.com/v1/chat/completions', [
            'model'    => 'gpt-4o-mini',
            'messages' => [['role' => 'user', 'content' => $prompt]],
        ]);

        if (!$response->successful()) {
            throw new \RuntimeException('OpenAI API error: ' . $response->status() . ' ' . $response->body());
        }

        return $this->parseJson(
            $response->json('choices.0.message.content') ?? ''
        );
    }

    private function callMistral(string $apiKey, string $prompt): array
    {
        $response = Http::withHeaders([
            'Authorization' => "Bearer {$apiKey}",
            'Content-Type'  => 'application/json',
        ])->timeout(45)->post('https://api.mistral.ai/v1/chat/completions', [
            'model'    => 'mistral-small-latest',
            'messages' => [['role' => 'user', 'content' => $prompt]],
        ]);

        if (!$response->successful()) {
            throw new \RuntimeException('Mistral API error: ' . $response->status() . ' ' . $response->body());
        }

        return $this->parseJson(
            $response->json('choices.0.message.content') ?? ''
        );
    }

    private function callCohere(string $apiKey, string $prompt): array
    {
        $response = Http::withHeaders([
            'Authorization' => "Bearer {$apiKey}",
            'Content-Type'  => 'application/json',
        ])->timeout(45)->post('https://api.cohere.com/v2/chat', [
            'model'    => 'command-r-plus',
            'messages' => [['role' => 'user', 'content' => $prompt]],
        ]);

        if (!$response->successful()) {
            throw new \RuntimeException('Cohere API error: ' . $response->status() . ' ' . $response->body());
        }

        return $this->parseJson(
            $response->json('message.content.0.text') ?? ''
        );
    }

    // ── Shared JSON parser ────────────────────────────────────────────────────

    private function parseJson(string $content): array
    {
        $content = preg_replace('/^```json\s*/i', '', trim($content));
        $content = preg_replace('/```$/', '', $content);

        $decoded = json_decode(trim($content), true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new \RuntimeException('Failed to parse AI JSON response: ' . $content);
        }

        if (isset($decoded['score'])) {
            $decoded['score'] = max(0, min(100, (int) $decoded['score']));
        }

        $validRecs = ['strong_yes', 'yes', 'maybe', 'no'];
        if (!in_array($decoded['recommendation'] ?? '', $validRecs)) {
            $decoded['recommendation'] = 'maybe';
        }

        return $decoded;
    }

    // ── Build prompt (unchanged) ──────────────────────────────────────────────

    private function buildPrompt(Application $application): string
    {
        $job       = $application->jobPosting;
        $applicant = $application->applicant;

        $requirements     = implode("\n", array_map(fn($r) => "- {$r}", $job->requirements      ?? []));
        $niceToHaves      = implode("\n", array_map(fn($r) => "- {$r}", $job->nice_to_haves     ?? []));
        $responsibilities = implode("\n", array_map(fn($r) => "- {$r}", $job->responsibilities  ?? []));

        $cvText      = $this->extractCvText($application);
        $coverLetter = $application->cover_letter
            ? "COVER LETTER:\n{$application->cover_letter}"
            : 'No cover letter provided.';

        return <<<PROMPT
You are an expert HR recruiter screening job applications. Evaluate the following applicant against the job requirements and return a structured JSON response.

==== JOB POSTING ====
Title: {$job->title}
Department: {$job->department}
Type: {$job->type}
Experience Level: {$job->experience_level}

Responsibilities:
{$responsibilities}

Requirements:
{$requirements}

Nice to Have:
{$niceToHaves}

==== APPLICANT ====
Name: {$applicant->full_name}
Current Role: {$applicant->current_role}
Years of Experience: {$applicant->years_of_experience}
Location: {$applicant->location}

{$coverLetter}

CV / RESUME CONTENT:
{$cvText}

==== INSTRUCTIONS ====
Evaluate the applicant against the job requirements.

Return ONLY valid JSON in this exact structure, no markdown, no preamble:
{
  "score": <integer 0-100>,
  "summary": "<2-3 sentence overview of the candidate's fit>",
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "gaps": ["<gap 1>", "<gap 2>"],
  "recommendation": "<one of: strong_yes | yes | maybe | no>"
}

Scoring guide:
90-100: Exceptional fit, exceeds all requirements
75-89:  Strong fit, meets most requirements
60-74:  Good fit, meets core requirements with some gaps
40-59:  Partial fit, significant gaps but potential
0-39:   Poor fit, does not meet core requirements
PROMPT;
    }

    // ── CV extraction (unchanged) ─────────────────────────────────────────────

    private function extractCvText(Application $application): string
    {
        $cvDoc = $application->documents->where('type', 'cv')->first();

        if (!$cvDoc) {
            return 'No CV document uploaded.';
        }

        try {
            $fileContent = Storage::disk($cvDoc->disk)->get($cvDoc->path);

            if ($cvDoc->isPdf()) {
                $tmpPath = tempnam(sys_get_temp_dir(), 'cv_') . '.pdf';
                file_put_contents($tmpPath, $fileContent);

                $cmd = PHP_OS_FAMILY === 'Windows'
                    ? "pdftotext -layout \"{$tmpPath}\" -"
                    : "timeout 10 pdftotext -layout '{$tmpPath}' - 2>/dev/null";

                $text = shell_exec($cmd);
                @unlink($tmpPath);
                return $text ? trim($text) : '[PDF could not be parsed — raw file submitted]';
            }

            if (str_contains($cvDoc->mime_type ?? '', 'word') ||
                str_contains($cvDoc->mime_type ?? '', 'openxmlformats')) {
                return '[Word document — text extraction not supported. Please request PDF.]';
            }

            return mb_convert_encoding($fileContent, 'UTF-8', 'auto');

        } catch (\Exception $e) {
            Log::warning('CV text extraction failed', [
                'document_id'    => $cvDoc->id,
                'application_id' => $application->id,
                'error'          => $e->getMessage(),
            ]);
            return '[CV text extraction failed]';
        }
    }

    // ── Failure handler ───────────────────────────────────────────────────────

    public function failed(\Throwable $exception): void
    {
        Log::error('ScreenApplicationJob permanently failed', [
            'application_id' => $this->applicationId,
            'error'          => $exception->getMessage(),
        ]);
    }
}