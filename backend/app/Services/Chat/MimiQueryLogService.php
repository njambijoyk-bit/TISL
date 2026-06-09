<?php

namespace App\Services\Chat;

use App\Models\MimiQueryLog;
use App\Models\MimiSession;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;

class MimiQueryLogService
{
    public function __construct(
        private readonly MimiHarmScannerService $harmScanner,
    ) {}

    /**
     * Log a completed query/response pair.
     *
     * @param  MimiSession        $session
     * @param  string             $query        The raw user message
     * @param  JsonResponse|null  $response     The Laravel response object (null on connection error)
     * @param  array              $geminiRaw    The raw decoded Gemini API response array (empty on failure)
     * @param  int                $responseMs   How long the Gemini call took in milliseconds
     * @param  bool               $wasBlocked   True if the actor was blocked before Gemini was called
     * @param  string|null        $errorMessage Error string if the call failed
     * @param  int|null           $httpStatus   HTTP status from Gemini (null if never reached)
     */
    public function logQuery(
        MimiSession   $session,
        string        $query,
        ?JsonResponse $response,
        array         $geminiRaw,
        int           $responseMs,
        bool          $wasBlocked   = false,
        ?string       $errorMessage = null,
        ?int          $httpStatus   = null,
    ): MimiQueryLog {
        try {
            // Determine response status
            $responseStatus = $this->resolveResponseStatus(
                $wasBlocked, $errorMessage, $httpStatus, $response
            );

            // Extract reply text from the response
            $replyText = null;
            if ($response) {
                $decoded   = $response->getData(true);
                $replyText = $decoded['reply'] ?? $decoded['error'] ?? null;
            }

            // Harm scan — only run on non-blocked, non-error queries
            $harmResult = ['is_harmful' => false, 'harm_category' => null];
            if (!$wasBlocked && !$errorMessage) {
                $harmResult = $this->harmScanner->scan($query, $geminiRaw);
            }

            $log = MimiQueryLog::create([
                'session_id'       => $session->id,
                'actor_type'       => $session->actor_type,
                'customer_id'      => $session->customer_id,
                'user_id'          => $session->user_id,
                'ip_address'       => $session->ip_address,
                'query'            => $query,
                'response'         => $replyText,
                'response_status'  => $harmResult['is_harmful'] ? 'harmful' : $responseStatus,
                'error_message'    => $errorMessage,
                'http_status_code' => $httpStatus,
                'is_harmful'       => $harmResult['is_harmful'],
                'harm_category'    => $harmResult['harm_category'],
                'is_flagged'       => false,
                'query_length'     => mb_strlen($query),
                'response_length'  => $replyText ? mb_strlen($replyText) : null,
                'response_time_ms' => $responseMs,
                'queried_at'       => now(),
            ]);

            return $log;

        } catch (\Throwable $e) {
            // Logging must never crash the chat
            Log::error('MimiQueryLogService: failed to log query', [
                'error'      => $e->getMessage(),
                'session_id' => $session->id,
            ]);

            // Return a minimal unsaved instance so callers don't need to null-check
            return new MimiQueryLog(['session_id' => $session->id]);
        }
    }

    /**
     * Manually flag a query log entry (admin action).
     */
    public function flagQuery(int $logId, User $admin, string $reason): MimiQueryLog
    {
        $log = MimiQueryLog::findOrFail($logId);
        $log->update([
            'is_flagged'    => true,
            'flagged_by'    => $admin->id,
            'flagged_reason'=> $reason,
        ]);
        return $log->fresh();
    }

    /**
     * Remove a manual flag from a query log entry.
     */
    public function unflagQuery(int $logId): MimiQueryLog
    {
        $log = MimiQueryLog::findOrFail($logId);
        $log->update([
            'is_flagged'    => false,
            'flagged_by'    => null,
            'flagged_reason'=> null,
        ]);
        return $log->fresh();
    }

    // ── Private ───────────────────────────────────────────────────────────────

    private function resolveResponseStatus(
        bool          $wasBlocked,
        ?string       $errorMessage,
        ?int          $httpStatus,
        ?JsonResponse $response,
    ): string {
        if ($wasBlocked) return 'blocked';
        if ($errorMessage && str_contains(strtolower($errorMessage), 'connect')) return 'connection_error';
        if ($httpStatus === 429) return 'rate_limited';
        if ($httpStatus && $httpStatus >= 500) return 'api_error';
        if ($response && $response->getStatusCode() >= 500) return 'api_error';
        if (!$response) return 'connection_error';
        return 'success';
    }
}
