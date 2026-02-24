#!/bin/bash

# SwiftTrack - Quick Start Script
# This script helps you start the entire system

echo "🚀 SwiftTrack - Event-Driven Middleware System"
echo "=============================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js v18 or higher."
    exit 1
fi

echo "✅ Node.js version: $(node --version)"
echo ""

# Function to check if a port is in use
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Check MongoDB
echo "📊 Checking MongoDB..."
if check_port 27017; then
    echo "✅ MongoDB is running on port 27017"
else
    echo "⚠️  MongoDB is not running. Starting with Docker..."
    docker run -d --name swifttrack-mongodb -p 27017:27017 mongo:6
    sleep 3
fi

# Check RabbitMQ
echo ""
echo "🐰 Checking RabbitMQ..."
if check_port 5672; then
    echo "✅ RabbitMQ is running on port 5672"
else
    echo "⚠️  RabbitMQ is not running. Starting with Docker..."
    docker run -d --name swifttrack-rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management
    sleep 5
fi

echo ""
echo "📦 Installing dependencies..."
echo "This may take a few minutes..."
echo ""

# Create logs directories
mkdir -p api-gateway/logs
mkdir -p orchestration-service/logs
mkdir -p cms-adapter/logs
mkdir -p ros-adapter/logs
mkdir -p wms-adapter/logs
mkdir -p notification-service/logs
mkdir -p mock-services/cms-mock/logs
mkdir -p mock-services/wms-mock/logs

# Copy .env.example to .env if not exists
for dir in api-gateway orchestration-service cms-adapter ros-adapter wms-adapter notification-service; do
    if [ ! -f "$dir/.env" ]; then
        echo "Creating .env for $dir"
        cp "$dir/.env.example" "$dir/.env"
    fi
done

# Install root dependencies
npm install

# Install all service dependencies
echo ""
echo "Installing service dependencies..."
npm run install:services

echo ""
echo "✅ Installation complete!"
echo ""
echo "🎯 Starting all services..."
echo ""

# Start all services
npm run start:all
