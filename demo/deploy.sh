#!/bin/bash
set -e

echo "Building demo service Docker image..."
podman build --platform linux/arm64 -t demo-service:latest .

echo "Importing image to k3s..."
podman save demo-service:latest | sudo k3s ctr images import -

echo "Creating namespace..."
kubectl apply -f namespace.yaml

echo "Deploying services..."
kubectl apply -f apples.yaml
kubectl apply -f oranges.yaml
kubectl apply -f bananas.yaml

echo ""
echo "Demo services deployed successfully!"
echo ""
echo "Check deployment status with:"
echo "  kubectl get pods -n demo"
echo ""
echo "View logs:"
echo "  kubectl logs -n demo -l app=apples -f"
echo "  kubectl logs -n demo -l app=oranges -f"
echo "  kubectl logs -n demo -l app=bananas -f"
echo ""
echo "Traffic patterns:"
echo "  apples  -> oranges (every 60s)"
echo "  apples  -> bananas (every 120s)"
echo "  oranges -> bananas (every 60s)"
echo "  bananas -> apples  (every 180s)"
