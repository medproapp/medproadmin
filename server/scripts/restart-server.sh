#!/bin/bash

# Script to restart the MedPro Admin server

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/.."
LOG_DIR="$SERVER_DIR/logs"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Restarting MedPro Admin server...${NC}"

# First stop the server
echo -e "\n${YELLOW}Step 1: Stopping current server...${NC}"
"$SCRIPT_DIR/stop-server.sh"

# Wait a moment
echo -e "\n${YELLOW}Waiting for processes to clean up...${NC}"
sleep 2

# Create logs directory if it doesn't exist
mkdir -p "$LOG_DIR"

# Set the log file names with timestamp
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
RESTART_LOG="$LOG_DIR/restart-${TIMESTAMP}.log"

# Start the server again with logging
echo -e "\n${YELLOW}Step 2: Starting server...${NC}"
cd "$SERVER_DIR"

# Log the restart
echo "=== Server Restart at $(date) ===" >> "$RESTART_LOG"
echo "User: $(whoami)" >> "$RESTART_LOG"
echo "Directory: $(pwd)" >> "$RESTART_LOG"
echo "================================" >> "$RESTART_LOG"

# Start with output redirection
npm run dev >> "$RESTART_LOG" 2>&1 &

# Save the process ID
SERVER_PID=$!
echo $SERVER_PID > "$LOG_DIR/server.pid"

# Wait a moment for server to start
sleep 3

# Check if server started successfully
if ps -p $SERVER_PID > /dev/null; then
    echo -e "\n${GREEN}✓ Server restarted successfully!${NC}"
    echo -e "Process ID: ${GREEN}$SERVER_PID${NC}"
    echo -e "Restart log: ${GREEN}$RESTART_LOG${NC}"
    echo -e "\nServer is running at: ${GREEN}http://localhost:4040${NC}"
    echo -e "\nCommands:"
    echo -e "  View logs:   ${YELLOW}npm run logs${NC}"
    echo -e "  Stop server: ${YELLOW}npm run stop${NC}"
    echo -e "  Monitor:     ${YELLOW}tail -f $RESTART_LOG${NC}"
else
    echo -e "\n${RED}✗ Failed to start server!${NC}"
    echo -e "Check the log file: ${RED}$RESTART_LOG${NC}"
    tail -20 "$RESTART_LOG"
    exit 1
fi