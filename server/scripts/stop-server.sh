#!/bin/bash

# Script to stop only the MedPro Admin server running on port 4040

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
LOG_DIR="$SCRIPT_DIR/../logs"

echo "Stopping MedPro Admin server..."

# Check if PM2 is managing the process
if command -v pm2 &> /dev/null && pm2 list | grep -q "medpro-admin"; then
    echo "Stopping PM2 managed process..."
    pm2 stop medpro-admin
    pm2 delete medpro-admin
    echo "PM2 process stopped"
fi

# Find the process using port 4040
PID=$(lsof -ti:4040)

if [ -z "$PID" ]; then
    echo "No server found running on port 4040"
else
    echo "Found server process: $PID"
    kill -9 $PID
    echo "Server stopped successfully"
fi

# Also kill any nodemon process watching this directory
NODEMON_PID=$(ps aux | grep "nodemon.*medproadmin/server" | grep -v grep | awk '{print $2}')

if [ ! -z "$NODEMON_PID" ]; then
    echo "Found nodemon process: $NODEMON_PID"
    kill -9 $NODEMON_PID
    echo "Nodemon stopped successfully"
fi

# Check for PID file and clean up
if [ -f "$LOG_DIR/server.pid" ]; then
    PID_FROM_FILE=$(cat "$LOG_DIR/server.pid")
    if ps -p $PID_FROM_FILE > /dev/null 2>&1; then
        echo "Killing process from PID file: $PID_FROM_FILE"
        kill -9 $PID_FROM_FILE
    fi
    rm "$LOG_DIR/server.pid"
fi

echo "Done!"