#!/bin/bash

set -e

# Detect container runtime
if command -v podman &> /dev/null; then
    CONTAINER_RUNTIME="podman"
elif command -v docker &> /dev/null; then
    CONTAINER_RUNTIME="docker"
else
    echo "Error: Neither podman nor docker found"
    exit 1
fi

echo "Using container runtime: $CONTAINER_RUNTIME"

# Docker Hub username
DOCKER_USERNAME="emrahkk"

# Image names
BACKEND_IMAGE="$DOCKER_USERNAME/penny-backend:latest"
FRONTEND_IMAGE="$DOCKER_USERNAME/penny-frontend:latest"

echo "Tagging images..."
$CONTAINER_RUNTIME tag penny-backend:latest $BACKEND_IMAGE
$CONTAINER_RUNTIME tag penny-frontend:latest $FRONTEND_IMAGE

echo "Pushing images to Docker Hub..."
echo "Pushing backend..."
$CONTAINER_RUNTIME push $BACKEND_IMAGE

echo "Pushing frontend..."
$CONTAINER_RUNTIME push $FRONTEND_IMAGE

echo ""
echo "Images pushed successfully!"
echo "  - $BACKEND_IMAGE"
echo "  - $FRONTEND_IMAGE"
