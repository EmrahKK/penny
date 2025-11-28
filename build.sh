#!/bin/bash
set -e

# Detect container runtime (podman or docker)
if command -v podman &> /dev/null; then
    CONTAINER_RUNTIME="podman"
elif command -v docker &> /dev/null; then
    CONTAINER_RUNTIME="docker"
else
    echo "Error: Neither podman nor docker found. Please install one of them."
    exit 1
fi

echo "Using container runtime: $CONTAINER_RUNTIME"

# Detect architecture
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ] || [ "$ARCH" = "aarch64" ]; then
    # On Apple Silicon, try native ARM64 first (faster, more stable)
    echo "Detected ARM64 architecture"
    echo "Building PENNY images for linux/arm64..."
    PLATFORM="linux/arm64"
    TARGETARCH="arm64"
else
    echo "Building PENNY images for linux/amd64..."
    PLATFORM="linux/amd64"
    TARGETARCH="amd64"
fi

# Build backend
echo "Building backend image..."
$CONTAINER_RUNTIME build --platform $PLATFORM --build-arg TARGETARCH=$TARGETARCH -t penny-backend:latest ./backend

# Build frontend
echo "Building frontend image..."
$CONTAINER_RUNTIME build --platform $PLATFORM -t penny-frontend:latest ./frontend

echo "Build completed successfully!"
echo ""
echo "Images built:"
echo "  - penny-backend:latest"
echo "  - penny-frontend:latest"
echo ""
echo "For k3s, import images with:"
echo "  $CONTAINER_RUNTIME save penny-backend:latest | sudo k3s ctr images import -"
echo "  $CONTAINER_RUNTIME save penny-frontend:latest | sudo k3s ctr images import -"
echo ""
echo "For k3d:"
echo "  k3d image import penny-backend:latest penny-frontend:latest -c <cluster-name>"
echo ""
echo "For minikube:"
echo "  minikube image load penny-backend:latest"
echo "  minikube image load penny-frontend:latest"
