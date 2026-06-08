<?php

namespace App\Services;

use App\Models\BugReport;
use App\Models\BugReportStatusHistory;
use App\Models\DevAccessKey;
use App\Models\DevAccessKeyLog;
use App\Models\DevNote;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class BugReportService
{
    // ================================================================
    // BUG REPORTS
    // ================================================================

    /**
     * Create a bug report from any reporter type (guest, customer, admin).
     */
    public function createBugReport(array $data, ?int $customerId = null, ?int $userId = null): BugReport
    {
        return DB::transaction(function () use ($data, $customerId, $userId) {
            $report = BugReport::create([
                'report_number'  => BugReport::generateReportNumber(),
                'tracking_token' => BugReport::generateTrackingToken(),
                'customer_id'    => $customerId,
                'user_id'        => $userId,
                'guest_name'     => $data['guest_name']     ?? null,
                'guest_email'    => $data['guest_email']    ?? null,
                'title'          => $data['title'],
                'description'    => $data['description'],
                'page_url'       => $data['page_url']       ?? null,
                'screenshot_url' => $data['screenshot_url'] ?? null,
                'priority'       => $data['priority']       ?? 'medium',
                'status'         => 'open',
            ]);

            // Log initial status entry
            BugReportStatusHistory::create([
                'bug_report_id'     => $report->id,
                'from_status'       => null,
                'to_status'         => 'open',
                'note'              => 'Report submitted.',
                'changed_by_user_id'=> $userId,
                'created_at'        => now(),
            ]);

            return $report;
        });
    }

    /**
     * Update bug report status (admin only). Logs history entry.
     */
    public function updateStatus(BugReport $report, string $newStatus, ?string $note, int $adminUserId): BugReport
    {
        return DB::transaction(function () use ($report, $newStatus, $note, $adminUserId) {
            $oldStatus = $report->status;

            $report->update([
                'status'      => $newStatus,
                'resolved_at' => in_array($newStatus, ['resolved', 'wont_fix']) ? now() : $report->resolved_at,
            ]);

            BugReportStatusHistory::create([
                'bug_report_id'      => $report->id,
                'from_status'        => $oldStatus,
                'to_status'          => $newStatus,
                'note'               => $note,
                'changed_by_user_id' => $adminUserId,
                'created_at'         => now(),
            ]);

            return $report->fresh(['statusHistory']);
        });
    }

    /**
     * Update priority (admin only).
     */
    public function updatePriority(BugReport $report, string $priority): BugReport
    {
        $report->update(['priority' => $priority]);
        return $report->fresh();
    }

    /**
     * Public status lookup by tracking token (for guests).
     */
    public function getByTrackingToken(string $token): ?BugReport
    {
        return BugReport::where('tracking_token', $token)
            ->with(['statusHistory'])
            ->first();
    }

    /**
     * Link a dev note to a bug report.
     */
    public function linkDevNote(BugReport $report, DevNote $note): void
    {
        $report->update(['dev_note_id' => $note->id]);
    }

    // ================================================================
    // DEV ACCESS KEYS
    // ================================================================

    /**
     * Generate a new globally active dev access key.
     * Deactivates any existing active key first.
     */
    public function generateNewKey(): DevAccessKey
    {
        return DB::transaction(function () {
            // Deactivate current active key
            DevAccessKey::where('is_active', true)->update([
                'is_active'           => false,
                'invalidated_at'      => now(),
                'invalidation_reason' => 'manual',
            ]);

            $raw = $this->buildRawKey();

            return DevAccessKey::create([
                'key_hash'     => Hash::make($raw),
                'key_preview'  => substr($raw, 0, 6),
                'raw_key'      => $raw,
                'is_active'    => true,
                'generated_at' => now(),
            ]);
        });
    }

    /**
     * Attempt authentication with a key.
     * Returns ['success' => bool, 'message' => string, 'new_key' => DevAccessKey|null]
     */
    public function attemptKeyAuth(string $attempted, string $ip, string $userAgent): array
    {
        $activeKey = DevAccessKey::getActive();

        if (!$activeKey) {
            return ['success' => false, 'message' => 'No active key found. Contact admin.', 'new_key' => null];
        }

        $isMatch = Hash::check($attempted, $activeKey->key_hash);

        // Log the attempt
        DevAccessKeyLog::create([
            'dev_access_key_id' => $activeKey->id,
            'attempted_key'     => $attempted,
            'result'            => $isMatch ? 'success' : 'failure',
            'ip_address'        => $ip,
            'user_agent'        => $userAgent,
            'attempted_at'      => now(),
        ]);

        if ($isMatch) {
            // Invalidate used key and generate new one
            $activeKey->update([
                'is_active'           => false,
                'used_at'             => now(),
                'invalidated_at'      => now(),
                'invalidation_reason' => 'used',
            ]);
            $newKey = $this->generateNewKey();
            return ['success' => true, 'message' => 'Access granted.', 'new_key' => $newKey];
        }

        // Failed attempt
        $activeKey->increment('failed_attempts');
        $activeKey->refresh();

        if ($activeKey->isExhausted()) {
            $activeKey->update([
                'is_active'           => false,
                'invalidated_at'      => now(),
                'invalidation_reason' => 'failed_attempts',
            ]);
            $newKey = $this->generateNewKey();
            return [
                'success' => false,
                'message' => 'Too many failed attempts. Key has been reset. Contact admin for new key.',
                'new_key' => $newKey,
            ];
        }

        $remaining = 10 - $activeKey->failed_attempts;
        return [
            'success' => false,
            'message' => "Invalid key. {$remaining} attempt(s) remaining before reset.",
            'new_key' => null,
        ];
    }

    /**
     * Get the current active key (for admin board display).
     */
    public function getActiveKey(): ?DevAccessKey
    {
        return DevAccessKey::getActive();
    }

    /**
     * Build random key from allowed charset.
     * Charset: letters (upper+lower) + digits + ?,.><}{=#@!&*()$
     */
    private function buildRawKey(int $length = 20): string
    {
        $letters  = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
        $digits   = '0123456789';
        $symbols  = '?,.><}{=#@!&*()$';
        $charset  = $letters . $digits . $symbols;
        $charLen  = strlen($charset);

        $key = '';
        for ($i = 0; $i < $length; $i++) {
            $key .= $charset[random_int(0, $charLen - 1)];
        }
        return $key;
    }

    // ================================================================
    // DEV NOTES
    // ================================================================

    /**
     * Create a dev note (by dev via gated UX or by admin on their behalf).
     */
    public function createDevNote(array $data, bool $byDev = false, ?int $adminUserId = null): DevNote
    {
        return DB::transaction(function () use ($data, $byDev, $adminUserId) {
            $note = DevNote::create([
                'note_number'        => DevNote::generateNoteNumber(),
                'bug_report_id'      => $data['bug_report_id']   ?? null,
                'entered_by_user_id' => $adminUserId,
                'entered_by_dev'     => $byDev,
                'type'               => $data['type']             ?? 'general',
                'status'             => $data['status']           ?? 'pending',
                'pr_number'          => $data['pr_number']        ?? null,
                'pr_url'             => $data['pr_url']           ?? null,
                'branch_name'        => $data['branch_name']      ?? null,
                'git_url'            => $data['git_url']          ?? null,
                'commit_hash'        => $data['commit_hash']      ?? null,
                'title'              => $data['title'],
                'description'        => $data['description']      ?? null,
            ]);

            // If linked, update the bug report's dev_note_id (first note wins unless overridden)
            if ($note->bug_report_id) {
                $report = BugReport::find($note->bug_report_id);
                if ($report && !$report->dev_note_id) {
                    $report->update(['dev_note_id' => $note->id]);
                }
            }

            return $note;
        });
    }

    /**
     * Update a dev note's status.
     */
    public function updateDevNoteStatus(DevNote $note, string $status): DevNote
    {
        $note->update(['status' => $status]);
        return $note->fresh();
    }

    /**
     * Update a dev note's content (full update).
     */
    public function updateDevNote(DevNote $note, array $data): DevNote
    {
        $note->update(array_filter([
            'type'        => $data['type']        ?? $note->type,
            'status'      => $data['status']      ?? $note->status,
            'pr_number'   => $data['pr_number']   ?? $note->pr_number,
            'pr_url'      => $data['pr_url']      ?? $note->pr_url,
            'branch_name' => $data['branch_name'] ?? $note->branch_name,
            'git_url'     => $data['git_url']     ?? $note->git_url,
            'commit_hash' => $data['commit_hash'] ?? $note->commit_hash,
            'title'       => $data['title']       ?? $note->title,
            'description' => $data['description'] ?? $note->description,
        ], fn($v) => !is_null($v)));

        return $note->fresh(['bugReport', 'enteredBy']);
    }
}
