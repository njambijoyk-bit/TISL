# Branch scoping for staff (planned, not built)

Staff will have branches attached to them. Today `location_user` (user_id, location_id, role_scope) and the `User::canAccessLocation()` / `accessibleLocationIds()` helpers exist, but nothing in the app sets or enforces them (only the expiring-stock service reads the table).

1. **Attach branches to staff.** A Branches multi-select (and optional role at that branch) on the staff/employee edit screen; admin and super admin only. Stored in `location_user` (`role_scope` for the per-branch role). Show branch chips on the Team list and profile. A staff member with no branches keeps all-branch access for now and is flagged in the Team list.
2. **One shared rule.** Admin and super admin: all branches. Everyone else: the attached branches. One helper returns "all" or a list of branch ids; every query uses it.
3. **Where it applies, in order.** Vouchers and Books (registers, day book, ledger statements, reports; posting to an uncleared branch is refused) -> Stock (movement, counts, transfers, held stock; a transfer needs clearance on the sending branch, and on the receiving branch to receive) -> Verification (verifiers see and report on their branches only) -> Memoranda (follow their branch) -> orders, deliveries, cash and bank, petty cash.
4. **Open decisions.** Hidden versus view-only for other branches (lean: hidden). One role everywhere versus a role per branch via `role_scope` (lean: one role everywhere first). Customers, vendors and the chart of accounts stay company-wide.
5. **Test.** Two branches, one staff member attached to each; neither can see or post to the other's records.
