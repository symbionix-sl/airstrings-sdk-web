.PHONY: setup config seed install dev build clean

# Full setup: generate config, install deps, seed data, start dev server
setup: config install seed dev

# Extract public key → demo-config.generated.ts
config:
	bash generate-config.sh

# Install npm dependencies
install:
	npm install

# Seed demo strings and publish bundles via the API
seed:
	bash seed.sh

# Start Vite dev server
dev:
	npm run dev

# Build for production
build:
	npm run build

# Remove build artifacts and node_modules
clean:
	rm -rf dist node_modules
