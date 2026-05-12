Here are the edge cases to test, grouped by feature:

## Update Payment Status (Manual Payments)

1. **Paid → Paid again**: Mark an order as paid twice — does it create duplicate payment records? `syncOrderPaymentStatus()` should handle this, but verify the second payment doesn't double-count
2. **Partially paid → Paid**: Enter a partial payment, then mark as paid — does `syncOrderPaymentStatus()` correctly sum both and set `paid`?
3. **Partially paid → Partially paid**: Multiple partial payments — do snapshots and `amount_previously_paid_kes` update correctly for each?
4. **Amount exceeds order total**: Enter a partial payment amount greater than `snapshot_amount_still_owed_kes` — what happens?
5. **Zero amount**: Enter 0 as amount for partially paid
6. **Empty payment method**: Submit paid/partially_paid without selecting a method — validation should reject
7. **Duplicate payment reference for mpesa**: Enter the same reference twice for mpesa method — `mpesa_receipt_number` UNIQUE constraint will fail. The inline error should display
8. **Non-mpesa duplicate reference**: Same reference for bank_transfer twice — should be fine since `mpesa_receipt_number` is `null` for non-mpesa
9. **Already paid order**: Mark an already-paid order as paid again — the `snapshot_amount_still_owed_kes` will be 0, so the payment amount will be 0

## Cancel Order — Refund Calculation

10. **Cancel unpaid order**: No refund should happen, no payment records touched, no loyalty reversal
11. **Cancel fully paid order (not shipped)**: Branch 2 — proportional refund per item capped to confirmed payments, all confirmed payments marked as `refunded`
12. **Cancel partially paid order (not shipped)**: Refund should be capped to `totalConfirmedPayments`, not `total_kes`. Verify each item's refund is proportional
13. **Cancel paid order with NO payment records**: Order was marked as paid before this feature (legacy data) — `getTotalConfirmedPayments()` returns 0, `maxRefundable` = 0, items get `refund_amount = 0`. This is a real edge case — legacy orders paid outside of the system
14. **Cancel shipped/delivered + paid (with return items)**: Branch 3 — admin enters per-item refund amounts. Verify these are respected
15. **Cancel shipped/delivered + paid (returnless refund)**: Should now cap to confirmed payments instead of `line_total_after_discount`
16. **Cancel shipped/delivered + unpaid**: `requiresRefund = false`, `requiresReturn = true` — what happens? Should it still allow cancellation?
17. **Cancel order that used store credit**: `refundOrderStoreCredit()` should give back the credit. Then cancel again — should be idempotent
18. **Cancel order with referral code**: Check if `ReferralCodeUsage::markAsCancelled()` is being called (it may NOT be — this was flagged as a gap)

## Payment Records on Cancellation

19. **Full refund → payments marked as refunded**: Verify all `confirmed` payments for the order now have `status = 'refunded'` and `admin_notes` is appended
20. **Partial refund → refund record created**: Verify a new payment record with `method = 'refund'`, `status = 'confirmed'` exists with the correct `mpesa_amount_confirmed`
21. **Cancel order with mixed payments** (e.g., two partial mpesa + one manual): All confirmed should go to refunded on full refund
22. **Cancel order with already-failed payments**: Failed payments should NOT be touched — only `confirmed` ones

## Restore Order

23. **Restore fully refunded order**: Original payments stay `refunded`, order goes to `unpaid`, no refund records to cancel
24. **Restore partially refunded order**: The `method = 'refund'` record should be marked `cancelled`. Original payments stay as-is (they were `confirmed` since it was partial refund)
25. **Restore then re-cancel**: Cancel → Restore → Cancel again. Second cancel should create new refund records. Loyalty points should be deducted again (the `order_restore` tx exists, so the `order_cancel` idempotency check needs to handle this — **this is a potential bug**: the second cancel will find the first `order_cancel` tx and skip deduction)
26. **Restore with insufficient stock**: Should fail with a clear error message
27. **Restore order where customer spent the refunded store credit**: `rechargeOrderStoreCredit()` should zero out the deduction and add it back to the order total

## Loyalty Points

28. **Cancel paid order → points reversed**: Verify `order_cancel` transaction is created with negative points
29. **Cancel unpaid order → no point reversal**: `requiresRefund = false`, so the loyalty block shouldn't run
30. **Cancel paid order where customer already spent all points**: Deduction capped to `customer.loyalty_points` (could be 0). Verify it doesn't go negative
31. **Cancel twice** (e.g., API called twice): `order_cancel` tx already exists → skip. No double deduction
32. **Restore → points re-awarded**: Verify `order_restore` transaction is created with positive points equal to `abs(order_cancel.points)`
33. **Restore twice**: `order_restore` tx already exists → skip. No double award
34. **Cancel → Restore → Cancel again** (THE BIG ONE): The second cancel checks `order_cancel` exists → **it already does from the first cancel** → skips deduction. But the restore re-awarded the points. **This is a bug.** The idempotency check doesn't account for cancel-restore-cancel cycles. Fix: either check that no `order_restore` tx exists AFTER the last `order_cancel`, or delete/soft-delete the `order_cancel` tx when restoring
35. **Cancel order that was never paid** (no `order_earn` tx): `reversePointsForCancelledOrder()` finds no earn tx → returns early. Clean
36. **Cancel order with expired loyalty points**: The earn was done, points expired via `expiry` type, customer balance is 0 → deduction capped to 0

## Frontend — Payment Modal

37. **Loading state**: Button shows "Updating..." and is disabled during request
38. **Inline error display**: Force a 500 (e.g., duplicate mpesa reference) — error should appear inside the modal
39. **Clear error on modal reopen**: Close modal, reopen — previous error should be cleared
40. **Payment method field hidden for unpaid/failed**: Only shows for paid/partially_paid
41. **Amount field hidden for paid** (only shows for partially_paid)

## Frontend — ReturnItemsModal

42. **Shows confirmed payments, not order total**: For the auto-refund notice, verify it shows `totalConfirmedPayments` and `maxRefundable`
43. **Partially paid order warning**: The yellow warning about "only partially paid" should appear
44. **Per-item refund max capped**: Each item's refund input should max out at its proportional share of confirmed payments, not `line_total`
45. **Order with no payments data**: If `order.payments` is empty/undefined, `totalConfirmedPayments` should be 0 and refund should be locked

---

**Edge case #34 is the critical one.** The cancel-restore-cancel cycle will silently skip the loyalty point deduction on the second cancel because the idempotency check finds the first `order_cancel` transaction. You'll need to address this before going live — either by checking the sequence of transactions or by marking the old `order_cancel` tx differently when restoring.