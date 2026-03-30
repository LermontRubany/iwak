#!/bin/bash
set -e

echo "[deploy] Pulling latest code..."
cd /var/www/app
git pull origin main

echo "[deploy] Installing root dependencies..."
npm install

echo "[deploy] Building frontend..."
npm run build

echo "[deploy] Installing server dependencies..."
cd /var/www/app/server
npm install --omit=dev

echo "[deploy] Restarting server..."
pm2 restart iwak

echo "[deploy] Done! Site is live."
