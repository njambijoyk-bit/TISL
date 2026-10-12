<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Courses\CourseFile;
use App\Models\User;
use App\Services\Courses\CourseAccess;
use App\Services\Courses\CourseFiles;
use Illuminate\Http\Request;

/** The download behind a signed link. The link is made for one person and works for a few minutes; it is checked again here, so a link made before access ended gives nothing. */
class CoursesFileController extends Controller
{
    public function download(Request $request, CourseAccess $access, CourseFiles $files, int $file)
    {
        $f = CourseFile::findOrFail($file);
        $u = User::find((int) $request->query('u'));
        abort_unless($u && $access->canFile($u, $f), 403, 'You do not have access to this file.');
        abort_unless($files->exists($f), 404, 'The file is missing.');
        $files->record($f, $u, $request->ip());

        return $files->stream($f);
    }
}
