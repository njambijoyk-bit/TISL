<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class TestController extends Controller
{
    // TestController.php
    public function hello()
    {
        return response()->json(['message' => 'Hello World from Controller!']);
    }

    public function test()
    {
        return response()->json(['message' => 'API is working from Controller!']);
    }
}
