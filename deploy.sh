#!/bin/bash
set -e

echo "[deploy] Pulling latest code..."
cd /var/www/app
git pull origin main

echo "[deploy] Installing dependencies (root + server workspace)..."
npm install --workspaces --include-workspace-root

echo "[deploy] Building frontend..."
npm run build

echo "[deploy] Restarting server..."
pm2 restart fashion-store

echo "[deploy] Done! Site is live."
