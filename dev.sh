#!/bin/bash

set -e

echo "📥 Pulling latest changes..."
git pull

echo "🟢 Loading NVM..."
export NVM_DIR="$HOME/.nvm"

if [ -s "$NVM_DIR/nvm.sh" ]; then
    . "$NVM_DIR/nvm.sh"
else
    echo "❌ NVM not found. Install NVM first."
    exit 1
fi

echo "🟢 Using project Node version..."
nvm use

echo "📦 Installing dependencies..."
npm ci

echo "🚀 Starting TuneIn..."
npm run dev
