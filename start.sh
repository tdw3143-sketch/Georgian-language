#!/bin/bash
# Auto-start script for Georgian Language app
# Runs the Flask server and ngrok in detached screen sessions

cd /home/tdw3143/Georgian-language

# Load API key from .env file
if [ -f .env ]; then
  export $(cat .env | xargs)
fi

# Start Flask server
screen -dmS georgian python3 api.py

# Wait a moment for the server to start
sleep 3

# Start ngrok with fixed domain (keeps the same URL every time)
screen -dmS ngrok ngrok http --domain=entryway-hardly-strainer.ngrok-free.dev 8000

echo "Georgian app started!"
echo "Server: http://localhost:8000"
echo "Public: https://entryway-hardly-strainer.ngrok-free.dev"
