<?php

namespace App\Jobs;

use App\Models\Application;
use App\Models\ApplicationDocument;
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
    public int $timeout = 120;   // Claude API can be slow on large CVs

    public function __construct(public readonly int $applicationId) {}

    public function handle(): void
    {
        $application = Application::with(['applicant', 'jobPosting', 'documents'])
            ->find($this->applicationId);

        if (!$application) {
            Log::warning('ScreenApplicationJob: application not found', ['id' => $this->applicationId]);
            return;
        }

        // Guard: skip if already screened (in case of duplicate dispatch)
        if ($application->hasBeenScreened()) {
            return;
        }

        try {
            $prompt   = $this->buildPrompt($application);
            $result   = $this->callClaude($prompt);

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
                'score'          => $result['score'] ?? null,
                'recommendation' => $result['recommendation'] ?? null,
            ]);

        } catch (\Exception $e) {
            Log::error('ScreenApplicationJob failed', [
                'application_id' => $this->applicationId,
                'error'          => $e->getMessage(),
            ]);
            $this->fail($e);
        }
    }

    // ── Build the prompt ──────────────────────────────────────────────────────

    private function buildPrompt(Application $application): string
    {
        $job       = $application->jobPosting;
        $applicant = $application->applicant;

        $requirements   = implode("\n", array_map(fn($r) => "- {$r}", $job->requirements   ?? []));
        $niceToHaves    = implode("\n", array_map(fn($r) => "- {$r}", $job->nice_to_haves  ?? []));
        $responsibilities = implode("\n", array_map(fn($r) => "- {$r}", $job->responsibilities ?? []));

        $cvText = $this->extractCvText($application);

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

    // ── Call Claude API ───────────────────────────────────────────────────────

    private function callClaude(string $prompt): array
    {
        $response = Http::withHeaders([
            'x-api-key'         => config('services.anthropic.key'),
            'anthropic-version' => '2023-06-01',
            'content-type'      => 'application/json',
        ])->post('https://api.anthropic.com/v1/messages', [
            'model'      => 'claude-opus-4-6',
            'max_tokens' => 1024,
            'messages'   => [
                ['role' => 'user', 'content' => $prompt],
            ],
        ]);

        if (!$response->successful()) {
            throw new \RuntimeException('Claude API error: ' . $response->status() . ' ' . $response->body());
        }

        $content = $response->json('content.0.text') ?? '';

        // Strip any accidental markdown fences
        $content = preg_replace('/^```json\s*/i', '', trim($content));
        $content = preg_replace('/```$/', '', $content);

        $decoded = json_decode(trim($content), true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new \RuntimeException('Failed to parse Claude JSON response: ' . $content);
        }

        // Clamp score to valid range
        if (isset($decoded['score'])) {
            $decoded['score'] = max(0, min(100, (int) $decoded['score']));
        }

        // Validate recommendation
        $validRecs = ['strong_yes', 'yes', 'maybe', 'no'];
        if (!in_array($decoded['recommendation'] ?? '', $validRecs)) {
            $decoded['recommendation'] = 'maybe';
        }

        return $decoded;
    }

    // ── Extract CV text ───────────────────────────────────────────────────────

    private function extractCvText(Application $application): string
    {
        $cvDoc = $application->documents
            ->where('type', 'cv')
            ->first();

        if (!$cvDoc) {
            return 'No CV document uploaded.';
        }

        try {
            $fileContent = Storage::disk($cvDoc->disk)->get($cvDoc->path);

            // PDF text extraction via pdftotext (install poppler-utils on server)
            if ($cvDoc->isPdf()) {
                $tmpPath = tempnam(sys_get_temp_dir(), 'cv_') . '.pdf';
                file_put_contents($tmpPath, $fileContent);

                $text = shell_exec("pdftotext -layout '{$tmpPath}' - 2>/dev/null");
                unlink($tmpPath);

                return $text ? trim($text) : '[PDF could not be parsed — raw file submitted]';
            }

            // Fallback: plain text or Word (basic)
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

    // ── Queue failure handler ─────────────────────────────────────────────────

    public function failed(\Throwable $exception): void
    {
        Log::error('ScreenApplicationJob permanently failed', [
            'application_id' => $this->applicationId,
            'error'          => $exception->getMessage(),
        ]);
    }
}