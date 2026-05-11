<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class AdminTemporaryPasswordNotification extends Notification
{
    use Queueable;

    public function __construct(public string $temporaryPassword) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $loginUrl = config('app.frontend_url') . '/careers/login';

        return (new MailMessage)
            ->subject('Your TISL Careers password has been reset')
            ->greeting("Hi {$notifiable->first_name},")
            ->line('An administrator has reset your TISL Careers account password.')
            ->line('Your temporary password is:')
            ->line("**{$this->temporaryPassword}**")
            ->action('Log in & Change Password', $loginUrl)
            ->line('You will be required to set a new password immediately after logging in.')
            ->line('If you did not expect this, please contact support.');
    }
}