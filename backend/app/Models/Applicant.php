<?php

namespace App\Models;

use App\Notifications\ApplicantResetPasswordNotification;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class Applicant extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable, SoftDeletes;

    protected $fillable = [
        'first_name',
        'last_name',
        'email',
        'password',
        'phone',
        'linkedin_url',
        'portfolio_url',
        'current_role',
        'years_of_experience',
        'location',
        'status',
        'must_change_password',
        'email_verified_at',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected $casts = [
        'email_verified_at'  => 'datetime',
        'years_of_experience'=> 'integer',
        'must_change_password' => 'boolean',
    ];

    // ── Computed ──────────────────────────────────────────────────────────────

    public function getFullNameAttribute(): string
    {
        return trim("{$this->first_name} {$this->last_name}");
    }

    public function getIsVerifiedAttribute(): bool
    {
        return !is_null($this->email_verified_at);
    }

    public function isActive(): bool
    {
        return $this->status === 'active';
    }

    // ── Relations ─────────────────────────────────────────────────────────────

    public function applications()
    {
        return $this->hasMany(Application::class);
    }

    public function activeApplications()
    {
        return $this->hasMany(Application::class)
                    ->whereNotIn('status', ['rejected', 'withdrawn']);
    }

    // ── Password broker target ────────────────────────────────────────────────
    // Tells Laravel which broker to use for password resets on this model.

    public function sendPasswordResetNotification($token): void
    {
        $this->notify(new ApplicantResetPasswordNotification($token));
    }
}