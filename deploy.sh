#!/usr/bin/env bash

docker compose \
  --env-file .env.n8n \
  --env-file .env.postgres \
  --env-file .env.redis \
  --env-file .env.rabbitmq \
  up
