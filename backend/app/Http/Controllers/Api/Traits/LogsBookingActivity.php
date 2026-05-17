<?php

namespace App\Http\Controllers\Api\Traits;

use App\Models\BookingActivityLog;
use Illuminate\Support\Facades\Request;

trait LogsBookingActivity
{
    /**
     * Log a booking-related action.
     *
     * @param  int          $bookingId
     * @param  string       $action        e.g. BOOKING_CREATED, STAFF_ASSIGNED
     * @param  string|null  $subjectType   e.g. 'booking', 'worksheet', 'booking_staff'
     * @param  int|null     $subjectId
     * @param  array|null   $before        snapshot before change
     * @param  array|null   $after         snapshot after change
     * @param  int|null     $worksheetId
     */
    protected function logBookingActivity(
        int     $bookingId,
        string  $action,
        ?string $subjectType = null,
        ?int    $subjectId   = null,
        ?array  $before      = null,
        ?array  $after       = null,
        ?int    $worksheetId = null,
    ): void {
        $user = auth()->user();

        BookingActivityLog::create([
            'booking_id'       => $bookingId,
            'worksheet_id'     => $worksheetId,
            'action'           => $action,
            'subject_type'     => $subjectType,
            'subject_id'       => $subjectId,
            'performed_by'     => $user?->id,
            'performed_by_role'=> $user?->role,
            'before'           => $before,
            'after'            => $after,
            'ip_address'       => Request::ip(),
            'user_agent'       => Request::userAgent(),
        ]);
    }

    // ── Convenience wrappers ────────────────────────────────────────────────

    protected function logBookingCreated(int $bookingId, array $snapshot): void
    {
        $this->logBookingActivity($bookingId, 'BOOKING_CREATED', 'booking', $bookingId, null, $snapshot);
    }

    protected function logBookingConfirmed(int $bookingId): void
    {
        $this->logBookingActivity($bookingId, 'BOOKING_CONFIRMED', 'booking', $bookingId);
    }

    protected function logStatusChanged(int $bookingId, string $from, string $to): void
    {
        $this->logBookingActivity($bookingId, 'STATUS_CHANGED', 'booking', $bookingId, ['status' => $from], ['status' => $to]);
    }

    protected function logStaffAssigned(int $bookingId, int $staffId, string $role): void
    {
        $this->logBookingActivity($bookingId, 'STAFF_ASSIGNED', 'booking_staff', $staffId, null, ['user_id' => $staffId, 'role' => $role]);
    }

    protected function logStaffTaskUpdated(int $bookingId, int $staffId, ?string $before, ?string $after): void
    {
        $this->logBookingActivity($bookingId, 'STAFF_TASK_UPDATED', 'booking_staff', $staffId, ['task' => $before], ['task' => $after]);
    }

    protected function logStaffRemoved(int $bookingId, int $staffId): void
    {
        $this->logBookingActivity($bookingId, 'STAFF_REMOVED', 'booking_staff', $staffId, ['user_id' => $staffId]);
    }

    protected function logWorksheetCreated(int $bookingId, int $worksheetId): void
    {
        $this->logBookingActivity($bookingId, 'WORKSHEET_CREATED', 'worksheet', $worksheetId, null, null, $worksheetId);
    }

    protected function logWorksheetSubmitted(int $bookingId, int $worksheetId): void
    {
        $this->logBookingActivity($bookingId, 'WORKSHEET_SUBMITTED', 'worksheet', $worksheetId, null, null, $worksheetId);
    }

    protected function logWorksheetApproved(int $bookingId, int $worksheetId): void
    {
        $this->logBookingActivity($bookingId, 'WORKSHEET_APPROVED', 'worksheet', $worksheetId, null, null, $worksheetId);
    }

    protected function logWorksheetRejected(int $bookingId, int $worksheetId, string $reason): void
    {
        $this->logBookingActivity($bookingId, 'WORKSHEET_REJECTED', 'worksheet', $worksheetId, null, ['reason' => $reason], $worksheetId);
    }

    protected function logItemAdded(int $bookingId, int $worksheetId, array $item): void
    {
        $this->logBookingActivity($bookingId, 'ITEM_ADDED', 'worksheet_item', null, null, $item, $worksheetId);
    }

    protected function logItemRemoved(int $bookingId, int $worksheetId, array $item): void
    {
        $this->logBookingActivity($bookingId, 'ITEM_REMOVED', 'worksheet_item', null, $item, null, $worksheetId);
    }

    protected function logOrderGenerated(int $bookingId, int $orderId): void
    {
        $this->logBookingActivity($bookingId, 'ORDER_GENERATED', 'order', $orderId, null, ['order_id' => $orderId]);
    }

    protected function logBookingCancelled(int $bookingId, string $reason, float $fee = 0): void
    {
        $this->logBookingActivity($bookingId, 'BOOKING_CANCELLED', 'booking', $bookingId, null, ['reason' => $reason, 'fee' => $fee]);
    }

    protected function logCustomerDisqualified(int $bookingId, int $customerId, string $reason): void
    {
        $this->logBookingActivity($bookingId, 'CUSTOMER_DISQUALIFIED', 'customer', $customerId, null, ['reason' => $reason]);
    }

    protected function logCustomerReactivated(int $bookingId, int $customerId, ?string $notes): void
    {
        $this->logBookingActivity($bookingId, 'CUSTOMER_REACTIVATED', 'customer', $customerId, null, ['notes' => $notes]);
    }

    protected function logPolicyAccepted(int $bookingId, string $version): void
    {
        $this->logBookingActivity($bookingId, 'POLICY_ACCEPTED', 'booking', $bookingId, null, ['policy_version' => $version]);
    }
}