.PHONY: up down dev test build setup seed health logs k8s-build k8s-apply

up:
	docker compose up -d

down:
	docker compose down

setup:
	npm run setup:local

seed:
	npm run prisma:seed

dev:
	npm run dev

test:
	npm test

build:
	npm run build

health:
	./scripts/healthcheck.sh

logs:
	docker compose logs -f postgres redis

# Build image for local cluster (e.g. kind, minikube). Load: kind load docker-image relayroom:latest
k8s-build:
	docker build -t relayroom:latest .

# Apply namespace, Postgres, Redis, then app (run k8s-build or push image first)
k8s-apply:
	kubectl apply -f k8s/infrastructure.yaml
	kubectl apply -f k8s/relayroom.yaml
