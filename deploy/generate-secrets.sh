#!/usr/bin/env bash
# Prints a fresh set of secrets for .env. Run once per environment; never reuse.
# Store DATA_ENCRYPTION_KEY in the key vault and back it up separately from the
# database: without it, encrypted sensitive records cannot be read.
set -euo pipefail
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
echo "JWT_OFFICER_SECRET=$(openssl rand -hex 48)"
echo "JWT_TEACHER_SECRET=$(openssl rand -hex 48)"
echo "DATA_ENCRYPTION_KEY=$(openssl rand -hex 32)"
echo "NATIONAL_ID_PEPPER=$(openssl rand -hex 32)"
