<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Mail\Mailable as MailableContract;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

abstract class BaseMail extends Mailable implements MailableContract
{
    use Queueable, SerializesModels;

    protected function withSuperadminBcc(): static
    {
        return $this->bcc(config('mail.superadmin'));
    }
}