<?php

namespace App\Services\Events;

use App\Models\Events\Event;
use App\Models\Events\EventTicket;
use Illuminate\Support\Collection;

/** The tickets as a PDF, one page each, to print or keep on a phone: the event, who it is for, the QR and the reference. */
final class TicketPdf
{
    public function __construct(private TicketPresenter $present)
    {
    }

    /** @param Collection<int, EventTicket> $tickets @return string the PDF bytes */
    public function render(Collection $tickets): string
    {
        if (! class_exists(\Dompdf\Dompdf::class)) {
            throw new EventException('PDF tickets are not available on this server.');
        }
        $pdf = new \Dompdf\Dompdf(['isRemoteEnabled' => false]);
        $pdf->loadHtml($this->html($tickets));
        $pdf->setPaper('A4');
        $pdf->render();

        return $pdf->output();
    }

    /** @param Collection<int, EventTicket> $tickets */
    public function html(Collection $tickets): string
    {
        $pages = [];
        foreach ($tickets as $t) {
            $e = Event::withTrashed()->with('sessions')->findOrFail($t->event_id);
            $v = $this->present->ticket($t, $e);
            $ev = $this->present->event($e);
            $when = collect($v['sessions'])->reject(fn ($s) => $s['is_cancelled'])->map(fn ($s) => $this->when($s['starts_at'], $s['ends_at']) . ($s['label'] ? ' (' . e($s['label']) . ')' : ''))->implode('<br>');
            $where = $e->kind === 'online' ? 'Online' : e(trim($ev['venue_name'] . ($ev['venue_address'] ? ', ' . $ev['venue_address'] : '')));
            $qr = 'data:image/png;base64,' . base64_encode(TicketCodes::qrPng($t, 8));
            $void = $t->state !== EventTicket::VALID ? '<p style="color:#b91c1c;font-weight:bold;">This ticket is ' . e($t->state) . ' and will not be accepted.</p>' : '';
            $pages[] = '<div class="page"><h1>' . e($e->title) . '</h1>' . ($e->organiser ? '<p class="muted">By ' . e($e->organiser) . '</p>' : '') . '<table><tr><td class="info">'
                . '<p class="label">When</p><p>' . $when . '</p><p class="label">Where</p><p>' . $where . '</p><p class="label">Ticket</p><p>' . e((string) $v['type']) . '</p>'
                . '<p class="label">Name</p><p>' . e((string) ($t->holder_name ?: $t->buyer_name)) . '</p></td><td class="qr"><img src="' . $qr . '" width="230" height="230"><p class="ref">' . e($t->reference) . '</p></td></tr></table>'
                . $void . ($ev['note'] !== '' ? '<p class="note">' . e($ev['note']) . '</p>' : '') . ($v['join_url'] ? '<p class="note">Join online: ' . e($v['join_url']) . '</p>' : '')
                . '<p class="muted">Show this QR code at the door. One ticket admits one person.</p></div>';
        }

        return '<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:DejaVu Sans,Helvetica,Arial,sans-serif;color:#111827}.page{page-break-after:always}.page:last-child{page-break-after:auto}'
            . 'h1{font-size:26px;margin:0 0 4px}table{width:100%;margin-top:18px}td{vertical-align:top}.info{width:55%}.qr{text-align:center}.label{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin:12px 0 0}'
            . 'p{margin:2px 0;font-size:14px}.ref{font-family:monospace;font-size:20px;font-weight:bold;letter-spacing:3px}.muted{color:#6b7280;font-size:12px}.note{margin-top:14px;font-size:12px}</style></head><body>'
            . implode('', $pages) . '</body></html>';
    }

    private function when(string $start, ?string $end): string
    {
        $s = \Illuminate\Support\Carbon::parse($start);
        $text = $s->format('D j M Y, H:i');

        return e($end ? $text . ' – ' . \Illuminate\Support\Carbon::parse($end)->format('H:i') : $text);
    }
}
