#!/bin/bash
set -e

echo "[deploy] Pulling latest code..."
cd /var/www/app
git pull origin main

echo "[deploy] Installing server dependencies..."
cd /var/www/app/server
npm install --production

echo "[deploy] Restarting server..."
pm2 restart iwak

echo "[deploy] Done! Site is live."
