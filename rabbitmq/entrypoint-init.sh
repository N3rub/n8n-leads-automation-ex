#!/usr/bin/env sh
# rabbitmq/entrypoint-init.sh
# Genera definitions.json en tiempo de arranque a partir de variables de entorno y arranca RabbitMQ normalmente.

set -eu

cat > /etc/rabbitmq/definitions.json << EOF
{
  "rabbit_version": "3.13.3",
  "vhosts": [
    { "name": "${RABBITMQ_DEFAULT_VHOST}" }
  ],
  "users": [
    {
      "name": "${RABBITMQ_DEFAULT_USER}",
      "password": "${RABBITMQ_DEFAULT_PASS}",
      "tags": "administrator"
    },
    {
      "name": "${RABBITMQ_APP_USER}",
      "password": "${RABBITMQ_APP_PASSWORD}",
      "tags": ""
    }
  ],
  "permissions": [
    {
      "user": "${RABBITMQ_DEFAULT_USER}",
      "vhost": "${RABBITMQ_DEFAULT_VHOST}",
      "configure": ".*",
      "write": ".*",
      "read": ".*"
    },
    {
      "user": "${RABBITMQ_APP_USER}",
      "vhost": "${RABBITMQ_DEFAULT_VHOST}",
      "configure": "^(leads|dlx).*",
      "write": "^(leads|dlx).*",
      "read": "^(leads|dlx).*"
    }
  ],
  "exchanges": [
    {
      "name": "leads",
      "vhost": "${RABBITMQ_DEFAULT_VHOST}",
      "type": "topic",
      "durable": true,
      "auto_delete": false,
      "arguments": {}
    },
    {
      "name": "dlx.leads",
      "vhost": "${RABBITMQ_DEFAULT_VHOST}",
      "type": "fanout",
      "durable": true,
      "auto_delete": false,
      "arguments": {}
    }
  ],
  "queues": [
    {
      "name": "leads.processing",
      "vhost": "${RABBITMQ_DEFAULT_VHOST}",
      "durable": true,
      "auto_delete": false,
      "arguments": {
        "x-dead-letter-exchange": "dlx.leads",
        "x-message-ttl": 86400000,
        "x-max-length": 100000
      }
    },
    {
      "name": "leads.crm-sync",
      "vhost": "${RABBITMQ_DEFAULT_VHOST}",
      "durable": true,
      "auto_delete": false,
      "arguments": {
        "x-dead-letter-exchange": "dlx.leads",
        "x-message-ttl": 86400000,
        "x-max-length": 100000
      }
    },
    {
      "name": "leads.dead-letter",
      "vhost": "${RABBITMQ_DEFAULT_VHOST}",
      "durable": true,
      "auto_delete": false,
      "arguments": {}
    }
  ],
  "bindings": [
    {
      "source": "leads",
      "vhost": "${RABBITMQ_DEFAULT_VHOST}",
      "destination": "leads.processing",
      "destination_type": "queue",
      "routing_key": "lead.received",
      "arguments": {}
    },
    {
      "source": "leads",
      "vhost": "${RABBITMQ_DEFAULT_VHOST}",
      "destination": "leads.crm-sync",
      "destination_type": "queue",
      "routing_key": "lead.enriched",
      "arguments": {}
    },
    {
      "source": "dlx.leads",
      "vhost": "${RABBITMQ_DEFAULT_VHOST}",
      "destination": "leads.dead-letter",
      "destination_type": "queue",
      "routing_key": "",
      "arguments": {}
    }
  ]
}
EOF

echo ">>> definitions.json generado correctamente"
echo ">>> Vhost: ${RABBITMQ_DEFAULT_VHOST}"
echo ">>> Admin: ${RABBITMQ_DEFAULT_USER}"
echo ">>> App user: ${RABBITMQ_APP_USER}"

# Arrancar RabbitMQ normalmente
exec docker-entrypoint.sh rabbitmq-server
