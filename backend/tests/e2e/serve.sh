#!/bin/bash
# Starts the throw-away server for browser checks on port 8000, on the database made by boot.php. Stop it with: kill $(cat /tmp/tisl-e2e.pid)
cd "$(dirname "$0")/../.."
FILE=${1:-/tmp/tisl-e2e.sqlite}
eval "$(php -r '$e = require "tests/e2e/env.php"; foreach ($e as $k => $v) echo "export $k=" . escapeshellarg($v) . "\n";')"
export DB_DATABASE="$FILE"
nohup php -S localhost:8000 -t public public/index.php > /tmp/tisl-e2e.log 2>&1 &
echo $! > /tmp/tisl-e2e.pid
sleep 1
echo "server on http://localhost:8000 (pid $(cat /tmp/tisl-e2e.pid))"
