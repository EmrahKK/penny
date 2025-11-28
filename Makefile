# Detect container runtime
CONTAINER_RUNTIME := $(shell command -v podman 2>/dev/null || command -v docker 2>/dev/null)

.PHONY: help build deploy clean dev-backend dev-frontend test logs

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

build: ## Build container images
	@./build.sh	

import-k3s: ## Import images to k3s
	@echo "Importing images to k3s..."
	@$(CONTAINER_RUNTIME) save gadget-backend:latest | sudo k3s ctr images import -
	@$(CONTAINER_RUNTIME) save gadget-frontend:latest | sudo k3s ctr images import -
	@echo "Images imported successfully!"

deploy: ## Deploy to Kubernetes
	@./deploy.sh

clean: ## Clean up Kubernetes resources
	@echo "Cleaning up Kubernetes resources..."
	@kubectl delete namespace gadget-management --ignore-not-found=true

dev-backend: ## Run backend in development mode
	@echo "Starting backend in development mode..."
	@cd backend && go run cmd/server/main.go

dev-frontend: ## Run frontend in development mode
	@echo "Starting frontend in development mode..."
	@cd frontend && npm run dev

test-backend: ## Run backend tests
	@cd backend && go test ./...

logs-backend: ## Show backend logs
	@kubectl logs -n gadget-management -l app=gadget-backend -f

logs-frontend: ## Show frontend logs
	@kubectl logs -n gadget-management -l app=gadget-frontend -f

port-forward: ## Port forward frontend service
	@echo "Port forwarding frontend service to localhost:3000..."
	@kubectl port-forward -n gadget-management svc/frontend 3000:80

status: ## Show deployment status
	@echo "Namespace:"
	@kubectl get ns gadget-management 2>/dev/null || echo "  Not deployed"
	@echo ""
	@echo "Pods:"
	@kubectl get pods -n gadget-management 2>/dev/null || echo "  Not deployed"
	@echo ""
	@echo "Services:"
	@kubectl get svc -n gadget-management 2>/dev/null || echo "  Not deployed"

install-deps-backend: ## Install backend dependencies
	@cd backend && go mod download

install-deps-frontend: ## Install frontend dependencies
	@cd frontend && npm install

install-deps: install-deps-backend install-deps-frontend ## Install all dependencies
