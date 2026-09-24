import { useCallback } from 'react';
import * as XLSX from 'xlsx';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function fmtDate(str) {
    if (!str) return '—';
    return new Date(str).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'long', year: 'numeric',
    });
}

function fmtDateTime(str) {
    if (!str) return '—';
    return new Date(str).toLocaleString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function fmtKES(val) {
    if (val == null) return '—';
    return `KES ${Number(val).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
}

function customerName(customer) {
    if (!customer) return '—';
    return `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim() || '—';
}

function shippingAddress(order) {
    const addr = order?.shipping_address;
    if (!addr) return '—';
    if (typeof addr === 'string') return addr;
    // JSON object — flatten to readable string
    return [addr.line1, addr.line2, addr.city, addr.county, addr.country]
        .filter(Boolean).join(', ');
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA SHAPERS — transform manifest into clean print-ready structures
// ─────────────────────────────────────────────────────────────────────────────

export function shapeAdminData(manifest, adminName) {
    return {
        manifest: {
            number:        manifest.manifest_number,
            status:        manifest.status_label ?? manifest.status,
            method:        manifest.delivery_method?.replace(/_/g, ' ') ?? '—',
            scheduledDate: fmtDate(manifest.scheduled_date),
            dispatchedAt:  fmtDateTime(manifest.dispatched_at),
            completedAt:   fmtDateTime(manifest.completed_at),
            distanceKm:    manifest.total_distance_km ?? null,
            durationMins:  manifest.actual_duration_minutes ?? null,
            notes:         manifest.notes ?? null,
            aiNotes:       manifest.ai_notes ?? null,
            assigner:      manifest.assigner?.name ?? '—',
        },
        driver: {
            name:  manifest.driver?.name ?? 'Unassigned',
            phone: manifest.driver?.phone ?? '—',
        },
        stops: (manifest.items ?? []).map((item, idx) => {
            const order    = item.order ?? {};
            const customer = order.customer ?? {};
            const orderItems = order.items ?? [];

            return {
                stopNo:          item.sort_order ?? idx + 1,
                itemId:          item.id,
                status:          item.status_label ?? item.status,
                deliveredAt:     fmtDateTime(item.delivered_at),
                attemptedAt:     fmtDateTime(item.attempted_at),
                failedReason:    item.failed_reason ?? null,
                deliveryNotes:   item.delivery_notes ?? null,
                order: {
                    id:            order.id,
                    number:        order.order_number ?? '—',
                    paymentMethod: order.payment_method?.replace(/_/g, ' ') ?? '—',
                    shippingMethod:order.shipping_method_name ?? '—',
                    subtotalKes:   fmtKES(order.subtotal_kes),
                    shippingCost:  fmtKES(order.shipping_cost),
                    totalKes:      fmtKES(order.total_kes),
                    shippingAddress: shippingAddress(order),
                },
                customer: {
                    number:        customer.customer_number ?? '—',
                    name:          customerName(customer),
                    phone:         customer.phone ?? '—',
                    alternatePhone:customer.alternate_phone ?? null,
                    email:         customer.email ?? '—',
                    company:       customer.company_name ?? null,
                    type:          customer.customer_type ?? '—',
                    tier:          customer.tier ?? '—',
                    hasCreditAccount: customer.has_credit_account ?? false,
                    creditLimit:   fmtKES(customer.credit_limit),
                    creditUsed:    fmtKES(customer.credit_used),
                    availableCredit: fmtKES(customer.available_credit),
                },
                orderItems: orderItems.map(oi => ({
                    product:   oi.product?.name ?? oi.product_name ?? '—',
                    sku:       oi.product?.sku ?? '—',
                    qty:       oi.quantity ?? 0,
                    unitPrice: fmtKES(oi.unit_price_kes ?? oi.unit_price),
                    lineTotal: fmtKES(oi.line_total_kes ?? oi.line_total),
                })),
            };
        }),
        printedBy:  adminName ?? 'Admin',
        printedAt:  fmtDateTime(new Date().toISOString()),
        totalStops: (manifest.items ?? []).length,
    };
}

export function shapeDriverData(manifest) {
    return {
        manifest: {
            number:        manifest.manifest_number,
            scheduledDate: fmtDate(manifest.scheduled_date),
        },
        driver: {
            name:  manifest.driver?.name ?? 'Unassigned',
            phone: manifest.driver?.phone ?? '—',
        },
        stops: (manifest.items ?? []).map((item, idx) => {
            const order    = item.order ?? {};
            const customer = order.customer ?? {};
            return {
                stopNo:   item.sort_order ?? idx + 1,
                itemId:   item.id,
                order: {
                    number:          order.order_number ?? '—',
                    shippingAddress: shippingAddress(order),
                },
                customer: {
                    name:  customerName(customer),
                    phone: customer.phone ?? '—',
                },
                orderItems: (order.items ?? []).map(oi => ({
                    product: oi.product?.name ?? oi.product_name ?? '—',
                    qty:     oi.quantity ?? 0,
                })),
            };
        }),
        totalStops: (manifest.items ?? []).length,
        printedAt:  fmtDateTime(new Date().toISOString()),
    };
}

// Returns array — one delivery note per order
export function shapeCustomerData(manifest, selectedOrderIds = null) {
    const items = (manifest.items ?? []).filter(item => {
        if (!selectedOrderIds) return true;
        return selectedOrderIds.includes(item.order?.id);
    });

    return items.map((item, idx) => {
        const order    = item.order ?? {};
        const customer = order.customer ?? {};
        return {
            stopNo:       item.sort_order ?? idx + 1,
            manifestNumber: manifest.manifest_number,
            deliveryDate:   fmtDate(manifest.scheduled_date),
            order: {
                number:          order.order_number ?? '—',
                shippingAddress: shippingAddress(order),
                paymentMethod:   order.payment_method?.replace(/_/g, ' ') ?? '—',
                shippingMethod:  order.shipping_method_name ?? '—',
                subtotalKes:     fmtKES(order.subtotal_kes),
                shippingCost:    fmtKES(order.shipping_cost),
                totalKes:        fmtKES(order.total_kes),
            },
            customer: {
                number:  customer.customer_number ?? '—',
                name:    customerName(customer),
                phone:   customer.phone ?? '—',
                company: customer.company_name ?? null,
            },
            orderItems: (order.items ?? []).map(oi => ({
                product:   oi.product?.name ?? oi.product_name ?? '—',
                qty:       oi.quantity ?? 0,
                unitPrice: fmtKES(oi.unit_price_kes ?? oi.unit_price),
                lineTotal: fmtKES(oi.line_total_kes ?? oi.line_total),
            })),
        };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// PRINT — triggers browser print on a hidden iframe-style div
// ─────────────────────────────────────────────────────────────────────────────

export function triggerPrint(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8" />
            <title>Print</title>
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { font-family: 'Arial', sans-serif; font-size: 11pt; color: #111; background: #fff; }
                @page { margin: 15mm 12mm; }
                @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
            </style>
        </head>
        <body>${el.innerHTML}</body>
        </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 400);
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV EXPORT
// ─────────────────────────────────────────────────────────────────────────────

export function exportAdminCSV(data, manifest) {
    const rows = [];

    // Header meta
    rows.push(['TISL — Admin Manifest Report']);
    rows.push(['Manifest', data.manifest.number]);
    rows.push(['Status', data.manifest.status]);
    rows.push(['Scheduled Date', data.manifest.scheduledDate]);
    rows.push(['Driver', `${data.driver.name} | ${data.driver.phone}`]);
    rows.push(['Assigned By', data.manifest.assigner]);
    rows.push(['Delivery Method', data.manifest.method]);
    rows.push(['Printed By', data.printedBy]);
    rows.push(['Printed At', data.printedAt]);
    rows.push([]);

    // Column headers
    rows.push([
        'Stop #', 'Order Number', 'Status',
        'Customer #', 'Customer Name', 'Phone', 'Company',
        'Customer Type', 'Tier', 'Has Credit', 'Credit Limit', 'Credit Used', 'Available Credit',
        'Shipping Address', 'Payment Method',
        'Product', 'SKU', 'Qty', 'Unit Price', 'Line Total',
        'Order Subtotal', 'Shipping Cost', 'Order Total',
        'Delivered At', 'Failed Reason',
    ]);

    // Rows — one row per order item (repeat stop info per item)
    data.stops.forEach(stop => {
        if (stop.orderItems.length === 0) {
            rows.push([
                stop.stopNo, stop.order.number, stop.status,
                stop.customer.number, stop.customer.name, stop.customer.phone, stop.customer.company ?? '',
                stop.customer.type, stop.customer.tier,
                stop.customer.hasCreditAccount ? 'Yes' : 'No',
                stop.customer.creditLimit, stop.customer.creditUsed, stop.customer.availableCredit,
                stop.order.shippingAddress, stop.order.paymentMethod,
                '—', '—', 0, '—', '—',
                stop.order.subtotalKes, stop.order.shippingCost, stop.order.totalKes,
                stop.deliveredAt, stop.failedReason ?? '',
            ]);
        } else {
            stop.orderItems.forEach((oi, i) => {
                rows.push([
                    i === 0 ? stop.stopNo : '',
                    i === 0 ? stop.order.number : '',
                    i === 0 ? stop.status : '',
                    i === 0 ? stop.customer.number : '',
                    i === 0 ? stop.customer.name : '',
                    i === 0 ? stop.customer.phone : '',
                    i === 0 ? (stop.customer.company ?? '') : '',
                    i === 0 ? stop.customer.type : '',
                    i === 0 ? stop.customer.tier : '',
                    i === 0 ? (stop.customer.hasCreditAccount ? 'Yes' : 'No') : '',
                    i === 0 ? stop.customer.creditLimit : '',
                    i === 0 ? stop.customer.creditUsed : '',
                    i === 0 ? stop.customer.availableCredit : '',
                    i === 0 ? stop.order.shippingAddress : '',
                    i === 0 ? stop.order.paymentMethod : '',
                    oi.product, oi.sku, oi.qty, oi.unitPrice, oi.lineTotal,
                    i === 0 ? stop.order.subtotalKes : '',
                    i === 0 ? stop.order.shippingCost : '',
                    i === 0 ? stop.order.totalKes : '',
                    i === 0 ? stop.deliveredAt : '',
                    i === 0 ? (stop.failedReason ?? '') : '',
                ]);
            });
        }
    });

    const csv = rows.map(r =>
        r.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
    ).join('\n');

    downloadFile(
        new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
        `manifest-${manifest.manifest_number}-admin.csv`
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// XLS EXPORT
// ─────────────────────────────────────────────────────────────────────────────

export function exportAdminXLS(data, manifest) {
    const wb = XLSX.utils.book_new();

    // ── Sheet 1: Summary ─────────────────────────────────────────────────────
    const summaryData = [
        ['TISL — Admin Manifest Report', '', '', ''],
        [],
        ['Manifest Number', data.manifest.number],
        ['Status',          data.manifest.status],
        ['Scheduled Date',  data.manifest.scheduledDate],
        ['Dispatched At',   data.manifest.dispatchedAt],
        ['Completed At',    data.manifest.completedAt],
        ['Delivery Method', data.manifest.method],
        ['Driver',          `${data.driver.name} (${data.driver.phone})`],
        ['Assigned By',     data.manifest.assigner],
        ['Total Stops',     data.totalStops],
        ['Distance (km)',   data.manifest.distanceKm ?? '—'],
        ['Duration (mins)', data.manifest.durationMins ?? '—'],
        ['Notes',           data.manifest.notes ?? '—'],
        ['Printed By',      data.printedBy],
        ['Printed At',      data.printedAt],
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    summarySheet['!cols'] = [{ wch: 20 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

    // ── Sheet 2: Stops Detail ────────────────────────────────────────────────
    const headers = [
        'Stop #', 'Order Number', 'Stop Status',
        'Customer #', 'Customer Name', 'Phone', 'Company',
        'Customer Type', 'Tier', 'Has Credit',
        'Credit Limit', 'Credit Used', 'Available Credit',
        'Shipping Address', 'Payment Method', 'Shipping Method',
        'Product', 'SKU', 'Qty', 'Unit Price', 'Line Total',
        'Order Subtotal', 'Shipping Cost', 'Order Total',
        'Delivered At', 'Attempted At', 'Failed Reason', 'Delivery Notes',
    ];

    const stopsRows = [headers];
    data.stops.forEach(stop => {
        const items = stop.orderItems.length ? stop.orderItems : [{ product: '—', sku: '—', qty: 0, unitPrice: '—', lineTotal: '—' }];
        items.forEach((oi, i) => {
            stopsRows.push([
                i === 0 ? stop.stopNo : '',
                i === 0 ? stop.order.number : '',
                i === 0 ? stop.status : '',
                i === 0 ? stop.customer.number : '',
                i === 0 ? stop.customer.name : '',
                i === 0 ? stop.customer.phone : '',
                i === 0 ? (stop.customer.company ?? '') : '',
                i === 0 ? stop.customer.type : '',
                i === 0 ? stop.customer.tier : '',
                i === 0 ? (stop.customer.hasCreditAccount ? 'Yes' : 'No') : '',
                i === 0 ? stop.customer.creditLimit : '',
                i === 0 ? stop.customer.creditUsed : '',
                i === 0 ? stop.customer.availableCredit : '',
                i === 0 ? stop.order.shippingAddress : '',
                i === 0 ? stop.order.paymentMethod : '',
                i === 0 ? stop.order.shippingMethod : '',
                oi.product, oi.sku, oi.qty, oi.unitPrice, oi.lineTotal,
                i === 0 ? stop.order.subtotalKes : '',
                i === 0 ? stop.order.shippingCost : '',
                i === 0 ? stop.order.totalKes : '',
                i === 0 ? stop.deliveredAt : '',
                i === 0 ? stop.attemptedAt : '',
                i === 0 ? (stop.failedReason ?? '') : '',
                i === 0 ? (stop.deliveryNotes ?? '') : '',
            ]);
        });
    });

    const stopsSheet = XLSX.utils.aoa_to_sheet(stopsRows);
    stopsSheet['!cols'] = headers.map(() => ({ wch: 18 }));
    stopsSheet['!cols'][16] = { wch: 32 }; // product name wider
    stopsSheet['!cols'][13] = { wch: 36 }; // address wider
    XLSX.utils.book_append_sheet(wb, stopsSheet, 'Stops Detail');

    XLSX.writeFile(wb, `manifest-${manifest.manifest_number}-admin.xlsx`);
}

// ─────────────────────────────────────────────────────────────────────────────
// DOWNLOAD HELPER
// ─────────────────────────────────────────────────────────────────────────────

function downloadFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOK
// ─────────────────────────────────────────────────────────────────────────────

export function usePrintManifest(manifest, adminName) {
    const printAdmin = useCallback((format) => {
        const data = shapeAdminData(manifest, adminName);
        if (format === 'csv') return exportAdminCSV(data, manifest);
        if (format === 'xls') return exportAdminXLS(data, manifest);
        // pdf — caller renders #print-admin-report then calls triggerPrint
        triggerPrint('print-admin-report');
    }, [manifest, adminName]);

    const printDriver = useCallback(() => {
        triggerPrint('print-driver-sheet');
    }, []);

    const printCustomer = useCallback(() => {
        triggerPrint('print-customer-notes');
    }, []);

    return { printAdmin, printDriver, printCustomer };
}