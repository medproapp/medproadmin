#!/bin/bash

# Script to start MedPro Admin server in production mode with PM2

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/.."
LOG_DIR="$SERVER_DIR/logs"

# Create logs directory if it doesn't exist
mkdir -p "$LOG_DIR"

cd "$SERVER_DIR"

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "PM2 is not installed. Installing globally..."
    npm install -g pm2
fi

# Start with PM2 for production
pm2 start server.js \
  --name "medpro-admin" \
  --log "$LOG_DIR/pm2.log" \
  --error "$LOG_DIR/pm2-error.log" \
  --output "$LOG_DIR/pm2-output.log" \
  --time \
  --merge-logs \
  --log-date-format "YYYY-MM-DD HH:mm:ss Z" \
  --env production \
  --max-memory-restart 1G

# Save PM2 configuration
pm2 save

echo "Server started in production mode with PM2"
echo "Commands:"
echo "  - View logs: pm2 logs medpro-admin"
echo "  - Monitor: pm2 monit"
echo "  - Stop: pm2 stop medpro-admin"
echo "  - Restart: pm2 restart medpro-admin"
echo "  - Status: pm2 status"