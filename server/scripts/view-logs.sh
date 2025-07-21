#!/bin/bash

# Script to view MedPro Admin server logs

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
LOG_DIR="$SCRIPT_DIR/../logs"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}MedPro Admin Server Logs${NC}"
echo "========================="

# Check if logs directory exists
if [ ! -d "$LOG_DIR" ]; then
    echo -e "${RED}No logs directory found${NC}"
    exit 1
fi

# Function to display menu
show_menu() {
    echo ""
    echo "Select log type to view:"
    echo "1) Combined logs (all)"
    echo "2) Error logs only"
    echo "3) Stripe API logs"
    echo "4) Authentication logs"
    echo "5) Database logs"
    echo "6) Real-time combined logs (tail -f)"
    echo "7) Real-time error logs (tail -f)"
    echo "8) Search logs"
    echo "9) Show log statistics"
    echo "0) Exit"
    echo ""
}

# Function to get latest log file
get_latest_log() {
    local pattern=$1
    ls -t "$LOG_DIR"/$pattern 2>/dev/null | head -1
}

# Function to show log stats
show_stats() {
    echo -e "\n${YELLOW}Log Statistics:${NC}"
    echo "----------------"
    
    # Count lines in each log type
    for logtype in combined error stripe auth database; do
        latest=$(get_latest_log "${logtype}-*.log")
        if [ -f "$latest" ]; then
            count=$(wc -l < "$latest")
            echo -e "${GREEN}${logtype}:${NC} $count entries today"
        fi
    done
    
    # Show disk usage
    echo -e "\n${YELLOW}Disk Usage:${NC}"
    du -sh "$LOG_DIR" 2>/dev/null
}

# Function to search logs
search_logs() {
    echo -n "Enter search term: "
    read search_term
    
    echo -n "Search in (all/error/stripe/auth/database): "
    read log_type
    
    if [ "$log_type" == "all" ]; then
        pattern="*.log"
    else
        pattern="${log_type}-*.log"
    fi
    
    echo -e "\n${YELLOW}Searching for '$search_term' in $log_type logs...${NC}\n"
    grep -n --color=always "$search_term" "$LOG_DIR"/$pattern 2>/dev/null | tail -50
}

# Main loop
while true; do
    show_menu
    read -p "Enter choice: " choice
    
    case $choice in
        1)
            latest=$(get_latest_log "combined-*.log")
            if [ -f "$latest" ]; then
                echo -e "\n${GREEN}Viewing: $latest${NC}"
                tail -100 "$latest"
            else
                echo -e "${RED}No combined logs found${NC}"
            fi
            ;;
        2)
            latest=$(get_latest_log "error-*.log")
            if [ -f "$latest" ]; then
                echo -e "\n${RED}Viewing: $latest${NC}"
                tail -50 "$latest"
            else
                echo -e "${GREEN}No error logs found (that's good!)${NC}"
            fi
            ;;
        3)
            latest=$(get_latest_log "stripe-*.log")
            if [ -f "$latest" ]; then
                echo -e "\n${BLUE}Viewing: $latest${NC}"
                tail -50 "$latest"
            else
                echo -e "${YELLOW}No Stripe logs found${NC}"
            fi
            ;;
        4)
            latest=$(get_latest_log "auth-*.log")
            if [ -f "$latest" ]; then
                echo -e "\n${YELLOW}Viewing: $latest${NC}"
                tail -50 "$latest"
            else
                echo -e "${YELLOW}No auth logs found${NC}"
            fi
            ;;
        5)
            latest=$(get_latest_log "database-*.log")
            if [ -f "$latest" ]; then
                echo -e "\n${BLUE}Viewing: $latest${NC}"
                tail -50 "$latest"
            else
                echo -e "${YELLOW}No database logs found${NC}"
            fi
            ;;
        6)
            latest=$(get_latest_log "combined-*.log")
            if [ -f "$latest" ]; then
                echo -e "\n${GREEN}Following: $latest${NC}"
                echo "Press Ctrl+C to stop..."
                tail -f "$latest"
            else
                echo -e "${RED}No combined logs found${NC}"
            fi
            ;;
        7)
            latest=$(get_latest_log "error-*.log")
            if [ -f "$latest" ]; then
                echo -e "\n${RED}Following: $latest${NC}"
                echo "Press Ctrl+C to stop..."
                tail -f "$latest"
            else
                echo -e "${GREEN}No error logs found${NC}"
            fi
            ;;
        8)
            search_logs
            ;;
        9)
            show_stats
            ;;
        0)
            echo "Exiting..."
            exit 0
            ;;
        *)
            echo -e "${RED}Invalid choice${NC}"
            ;;
    esac
    
    echo -e "\nPress Enter to continue..."
    read
done