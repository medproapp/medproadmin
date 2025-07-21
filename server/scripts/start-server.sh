#!/bin/bash

# Script to start MedPro Admin server with proper logging

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/.."
LOG_DIR="$SERVER_DIR/logs"

# Create logs directory if it doesn't exist
mkdir -p "$LOG_DIR"

# Set the log file names with timestamp
TIMESTAMP=$(date +"%Y-%m-%d")
STDOUT_LOG="$LOG_DIR/server-stdout-${TIMESTAMP}.log"
STDERR_LOG="$LOG_DIR/server-stderr-${TIMESTAMP}.log"

echo "Starting MedPro Admin server..."
echo "Logs will be written to:"
echo "  - Standard output: $STDOUT_LOG"
echo "  - Error output: $STDERR_LOG"
echo "  - Application logs: $LOG_DIR/"

cd "$SERVER_DIR"

# Start the server with output redirection
# - stdout goes to stdout log file and console
# - stderr goes to stderr log file and console
# - Both are appended to preserve previous logs
npm run dev 2>&1 | tee -a "$STDOUT_LOG" &

# Save the process ID
echo $! > "$LOG_DIR/server.pid"

echo "Server started with PID: $(cat "$LOG_DIR/server.pid")"
echo "To stop the server, run: npm run stop"