.PHONY: up down dev test build setup seed health logs

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
