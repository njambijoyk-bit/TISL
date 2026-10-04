<?php

use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Web Routes
|--------------------------------------------------------------------------
|
| Here is where you can register web routes for your application.
| These routes are loaded by the RouteServiceProvider and assigned
| to the "web" middleware group.
|
*/

/*
| Uploaded files (/storage/...).
| Normally the web server hands these out straight from public/storage (the `php artisan storage:link` link). When that link is missing
| or stale, a request falls through to the framework's own signed-URL route for the private disk and answers 403 for a file that is
| really there. This route comes first and serves the public disk itself, so uploads show either way. A missing file is a plain 404.
*/
Route::get('/storage/{path}', function (string $path) {
    $disk = \Illuminate\Support\Facades\Storage::disk('public');
    try {
        $found = $disk->exists($path);
    } catch (\Throwable) {
        $found = false;   // an odd path (such as ../) is never a file of ours
    }
    abort_unless($found, 404);

    return $disk->response($path, null, ['Cache-Control' => 'public, max-age=3600']);
})->where('path', '.*');
