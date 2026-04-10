<?php

namespace App\Policies;

use App\Models\Project;
use App\Models\ProjectParticipant;
use App\Models\Customer;
use App\Models\User;

class ProjectPolicy
{
    /**
     * Helper: Is user an internal staff role?
     */
    private function isStaff(User $user): bool
    {
        return in_array($user->role, ['super_admin', 'admin', 'manager', 'sales_rep'], true);
    }

    /**
     * Helper: Resolve customer_id for authenticated user (users -> customers.user_id).
     */
    private function customerIdFor(User $user): ?int
    {
        $customerId = Customer::where('user_id', $user->id)->value('id');
        return $customerId ? (int) $customerId : null;
    }

    /**
     * Helper: Fetch participant row for this user (either admin_user_id or customer_id).
     */
    private function participant(User $user, Project $project): ?ProjectParticipant
    {
        // Staff membership
        if ($this->isStaff($user)) {
            return ProjectParticipant::where('project_id', $project->id)
                ->where('participant_type', 'admin')
                ->where('admin_user_id', $user->id)
                ->whereIn('status', ['invited', 'active'])
                ->first();
        }

        // Customer membership
        $customerId = $this->customerIdFor($user);
        if (!$customerId) {
            return null;
        }

        return ProjectParticipant::where('project_id', $project->id)
            ->where('participant_type', 'customer')
            ->where('customer_id', $customerId)
            ->whereIn('status', ['invited', 'active'])
            ->first();
    }

    /**
     * Helper: If staff, some actions can be allowed globally even without participant row.
     * (You can tighten this later if you want "must be participant to access".)
     */
    private function staffGlobalAccess(User $user): bool
    {
        return $this->isStaff($user);
    }

    private function isSuperAdmin(User $user): bool
    {
        return $user->role === 'super_admin';
    }

    /**
     * List projects
     * - Staff: yes
     * - Customer: yes (their projects via participant)
     */
    public function viewAny(User $user): bool
    {
        // Listing will be filtered in controller anyway.
        return $this->isStaff($user) || $this->customerIdFor($user) !== null;
    }

    /**
     * View one project
     * - Staff: allowed (or require participant if you want)
     * - Customer: must be participant
     */
    public function view(User $user, Project $project): bool
    {
        if ($this->isSuperAdmin($user)) {
            return true;
        }

        if ($this->staffGlobalAccess($user)) {
            return true;
        }

        return $this->participant($user, $project) !== null;
    }

    /**
     * Create project
     * - Staff: yes
     * - Customer: optional (set false if only admins create)
     */
    public function create(User $user): bool
    {
        return $this->isStaff($user) || in_array($user->role, ['customer'], true);
    }

    /**
     * Update project
     * - Staff: allowed if admin_owner/admin_manager OR project owner_admin_id OR super/admin
     * - Customer: only customer_owner (optional, tighten as desired)
     */
    public function update(User $user, Project $project): bool
    {
        if ($this->isStaff($user)) {
            if (in_array($user->role, ['super_admin', 'admin'], true)) {
                return true;
            }

            // owner admin can update
            if ((int) $project->owner_admin_id === (int) $user->id) {
                return true;
            }

            $p = $this->participant($user, $project);
            if (!$p) return false;

            return in_array($p->role, ['admin_owner', 'admin_manager'], true);
        }

        $p = $this->participant($user, $project);
        if (!$p) return false;

        return $p->role === 'customer_owner';
    }

    /**
     * Soft delete project → goes to trash.
     * - super_admin: always allowed, no participant check.
     * - admin: must be an active/invited participant on this project.
     * - Everyone else (manager, sales_rep, customer): denied.
     */
    public function delete(User $user, Project $project): bool
    {
        if ($user->role === 'super_admin') {
            return true;
        }

        if ($user->role !== 'admin') {
            return false;
        }

        // Admin must be a participant on this specific project
        return ProjectParticipant::where('project_id', $project->id)
            ->where('participant_type', 'admin')
            ->where('admin_user_id', $user->id)
            ->whereIn('status', ['invited', 'active'])
            ->exists();
    }

    /**
     * View the project trash list.
     * - All admin roles (admin + super_admin) can see the trash.
     * - Customers cannot.
     */
    public function viewTrashed(User $user): bool
    {
        return in_array($user->role, ['super_admin', 'admin'], true);
    }

    /**
     * Restore a soft-deleted project from trash.
     * - All admin roles (admin + super_admin) can restore.
     * - Customers cannot.
     */
    public function restore(User $user, Project $project): bool
    {
        return in_array($user->role, ['super_admin', 'admin'], true);
    }

    /**
     * Permanently (force) delete a project.
     * - super_admin only.
     */
    public function forceDelete(User $user, Project $project): bool
    {
        return $user->role === 'super_admin';
    }

    // -----------------------------
    // Custom abilities (for controllers)
    // -----------------------------

    /**
     * Manage participants (invite/remove/role change)
     * - Staff: admin_owner/admin_manager OR admin/super_admin OR owner_admin_id
     * - Customer: customer_owner can invite customer participants only
     */
    public function manageParticipants(User $user, Project $project): bool
    {
        if ($this->isSuperAdmin($user)) {
            return true;
        }

        $p = $this->participant($user, $project);

        if (!$p) return false; // 🚫 must be participant

        if ($this->isStaff($user)) {
            return in_array($p->role, ['admin_owner', 'admin_manager'], true);
        }

        return $p->role === 'customer_owner';
    }

    /**
     * Comment / post messages
     * ✅ customer_viewer can comment (your requirement)
     * - Staff: always if can access project
     * - Customer: participant.can_comment = 1
     */
    public function comment(User $user, Project $project): bool
    {
        if ($this->isSuperAdmin($user)) {
            return true;
        }

        $p = $this->participant($user, $project);

        if (!$p) {
            return false; // 🚫 NOT a participant → cannot comment
        }

        if ($this->isStaff($user)) {
            return true; // staff participant can comment
        }

        return (int) $p->can_comment === 1;
    }

    /**
     * View finance dashboards/amounts
     * - Staff: admin/super_admin always; others only if participant.can_view_finance = 1
     * - Customer: only if participant.can_view_finance = 1 (or you can lock it)
     */
    public function viewFinance(User $user, Project $project): bool
    {
        if ($this->isStaff($user)) {
            if (in_array($user->role, ['super_admin', 'admin'], true)) {
                return true;
            }
            $p = $this->participant($user, $project);
            return $p ? (int) $p->can_view_finance === 1 : false;
        }

        $p = $this->participant($user, $project);
        return $p ? (int) $p->can_view_finance === 1 : false;
    }

    /**
     * Manage links (attach/detach quote_request/quote/order)
     * - Staff: admin_owner/admin_manager/admin/super_admin
     * - Customer: false (customers should not attach business objects directly)
     */
    public function manageLinks(User $user, Project $project): bool
    {
        if ($this->isSuperAdmin($user)) {
            return true;
        }

        $p = $this->participant($user, $project);

        if (!$p) return false;

        if (!$this->isStaff($user)) return false;

        return in_array($p->role, ['admin_owner', 'admin_manager', 'admin_support'], true);
    }

    /**
     * Manage items/tasks/milestones (operational work)
     * - Staff: yes if can view project
     * - Customer: customer_owner/editor maybe; viewers no
     */
    public function manageWork(User $user, Project $project): bool
    {
        if ($this->isSuperAdmin($user)) {
            return true;
        }

        $p = $this->participant($user, $project);

        if (!$p) return false;

        if ($this->isStaff($user)) {
            return true;
        }

        return in_array($p->role, ['customer_owner', 'customer_editor'], true);
    }
}