<?php

return [
    /*
     * Branch scope: what happens when someone asks for a branch they have no access to.
     *   off  nothing is checked
     *   log  allowed, but written to the access log as "would_deny" so you can see what would change (the default)
     *   on   refused with 403
     */
    'scope_mode' => env('ACCESS_SCOPE_MODE', 'log'),

    /*
     * Until branches are assigned, staff with no default branch and no grants see every branch (the rule the app has always had), so nobody is
     * locked out before access is set up. Turn off once every staff member has a default branch or a grant.
     */
    'unassigned_sees_all' => env('ACCESS_UNASSIGNED_SEES_ALL', true),
];
