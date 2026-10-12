<?php

namespace App\Services\Courses;

use App\Models\Courses\CourseFile;
use App\Models\Courses\Lesson;
use App\Models\User;
use App\Services\Books\BooksException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;

/**
 * Private files for notes, books' samples, recipes and lessons. They are kept on the private disk (never under a public address) and given out only through short-lived signed links made for one person;
 * every download is written to a log. Only a short list of document, picture, audio and archive types is accepted; programs and scripts are refused.
 */
class CourseFiles
{
    public const ALLOWED = ['pdf', 'epub', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'csv', 'rtf', 'odt', 'ods', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'mp3', 'm4a', 'mp4', 'zip'];

    private function disk()
    {
        return Storage::disk('local');
    }

    public function store(UploadedFile $file, ?int $offeringId, ?int $by): CourseFile
    {
        if (! $file->isValid()) {
            throw new BooksException('The file did not upload. Try again.');
        }
        $max = (int) CourseSettings::all()['max_file_mb'];
        if ($file->getSize() > $max * 1024 * 1024) {
            throw new BooksException("A file can be at most {$max} MB.");
        }
        $ext = strtolower($file->getClientOriginalExtension());
        if (! in_array($ext, self::ALLOWED, true)) {
            throw new BooksException('That kind of file is not allowed. Use a document, picture, audio, video or zip file.');
        }
        $name = $this->cleanName($file->getClientOriginalName());
        $hash = hash_file('sha256', $file->getRealPath());
        $path = 'courses/files/'.substr($hash, 0, 2).'/'.$hash.'-'.bin2hex(random_bytes(4)).'.'.$ext;
        $this->disk()->putFileAs(dirname($path), $file, basename($path));

        return CourseFile::create(['offering_id' => $offeringId, 'name' => $name, 'path' => $path, 'mime' => mb_substr((string) $file->getMimeType(), 0, 120), 'size_bytes' => (int) $file->getSize(), 'sha256' => $hash, 'uploaded_by' => $by]);
    }

    /** A name safe to show and to send back as the download name. */
    public function cleanName(string $name): string
    {
        $name = trim(preg_replace('/[\x00-\x1F\x7F\/\\\\:*?"<>|]+/', '_', basename($name)) ?? '');

        return mb_substr($name === '' ? 'file' : $name, 0, 190);
    }

    /** A link that works for one person for a few minutes. */
    public function link(CourseFile $f, User $u): string
    {
        $minutes = (int) CourseSettings::all()['download_minutes'];

        return URL::temporarySignedRoute('courses.download', now()->addMinutes($minutes), ['file' => $f->id, 'u' => $u->id]);
    }

    /** Count the download and write it to the log. */
    public function record(CourseFile $f, User $u, ?string $ip, ?int $offeringId = null): void
    {
        DB::table('course_downloads')->insert(['file_id' => $f->id, 'user_id' => $u->id, 'offering_id' => $offeringId ?? $f->offering_id, 'ip' => $ip ? mb_substr($ip, 0, 45) : null, 'created_at' => now()]);
        $f->increment('downloads');
    }

    public function exists(CourseFile $f): bool
    {
        return $this->disk()->exists($f->path);
    }

    public function stream(CourseFile $f)
    {
        return $this->disk()->download($f->path, $f->name, ['X-Content-Type-Options' => 'nosniff', 'Cache-Control' => 'private, no-store']);
    }

    /** A file in use by a lesson can not be removed. */
    public function remove(CourseFile $f): void
    {
        if (Lesson::where('file_id', $f->id)->exists()) {
            throw new BooksException('That file is used by a lesson: remove it from the lesson first.');
        }
        $this->disk()->delete($f->path);
        $f->delete();
    }

    /** @return array<string, mixed> */
    public function row(CourseFile $f): array
    {
        return ['id' => $f->id, 'name' => $f->name, 'mime' => $f->mime, 'size_bytes' => $f->size_bytes, 'downloads' => $f->downloads, 'offering_id' => $f->offering_id, 'created_at' => $f->created_at?->toIso8601String()];
    }
}
