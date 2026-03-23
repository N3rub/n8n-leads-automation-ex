# Documentación Técnica de Arquitectura
## Sistema de Procesamiento de Leads — AICOR N8N Stack
**Versión:** 1.1.0 | **Fecha:** Marzo 2026 | **Departamento:** Desarrollo

---

## Índice
1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Estructura del Repositorio](#2-estructura-del-repositorio)
3. [Arquitectura del Sistema](#3-arquitectura-del-sistema)
4. [Componentes e Infraestructura](#4-componentes-e-infraestructura)
5. [Base de Datos — Dos BDs en un Servidor](#5-base-de-datos--dos-bds-en-un-servidor)
6. [Flujo CI/CD y Custom Nodes](#6-flujo-cicd-y-custom-nodes)
7. [Seguridad Hardening](#7-seguridad-hardening)
8. [Observabilidad](#8-observabilidad)
9. [Gestión de Secretos](#9-gestión-de-secretos)
10. [Decisiones Técnicas ADRs](#10-decisiones-técnicas-adrs)
11. [Mejoras Futuras](#11-mejoras-futuras)
12. [Limitaciones Conocidas](#12-limitaciones-conocidas)
13. [Guía de Despliegue](#13-guía-de-despliegue)

---

## 1. Resumen Ejecutivo

Pipeline de procesamiento de leads **event-driven** sobre n8n en modo cola. Gestiona la ingesta, validación, enriquecimiento, deduplicación y sincronización CRM de leads en tiempo real.

```
LEAD (webhook) -> [WF1: Ingesta] -> RabbitMQ -> [WF2: Procesamiento] -> leads_db (PostgreSQL)
                                                                    ↓
                                                        [WF3: CRM Sync] -> HubSpot/Odoo
```

---

## 2. Estructura del Repositorio

```
aicor-n8n/
│
├── docker-compose.yml # Orquestación de todos los servicios
├── .env.example.* # Plantillas de variables de entorno (una por servicio)
├── .gitignore
├── ARCHITECTURE.md
├── REQUIREMENTS.md # Especificaciones originales de la prueba técnica
│
├── .github/
│   └── workflows/
│       └── ci-custom-nodes.yml # Build, test y deploy de custom nodes
│
├── n8n/ # Todo lo que el proceso n8n necesita
│   ├── custom-nodes/
│   │   └── n8n-nodes-hash-generator/
│   │       ├── src/
│   │       │   ├── nodes/HashGenerator/
│   │       │   │   ├── types.ts # Tipos y constantes (as const)
│   │       │   │   ├── hash.ts # Lógica pura testeable
│   │       │   │   └── HashGenerator.node.ts # Adaptador n8n
│   │       │   └── __tests__/
│   │       │       └── HashGenerator.test.ts # 38 tests, 100% cobertura
│   │       ├── package.json
│   │       ├── tsconfig.json
│   │       └── jest.config.js
│   └── workflows/ # JSONs exportados desde la UI de n8n
│       └── .gitkeep
│
├── postgres/
│   └── migrations/ # Ejecutados por docker-entrypoint-initdb.d (orden alfabético)
│       ├── 000_create_databases.sh # Crea leads_db (n8n_db la crea POSTGRES_DB)
│       └── 001_initial_schema.sql # Tablas de negocio en leads_db (\connect leads_db)
│
├── rabbitmq/
│   ├── rabbitmq.conf # Configuración hardened (heartbeat, memory limits)
│   └── definitions.json # Exchanges, queues, DLQ y usuarios pre-definidos
│
├── monitoring/
│   ├── prometheus/
│   │   └── prometheus.yml # Scraping de n8n /metrics y RabbitMQ
│   └── grafana/
│       ├── dashboards/
│       │   └── dashboard-provider.yml
│       └── datasources/
│           └── prometheus.yml
│
└── scripts/
    └── build-custom-nodes.sh # Build local de nodos (usado también por CI/CD)
```

### Criterios de organización

| Directorio | Criterio |
|---|---|
| `n8n/` | Todo lo que el contenedor n8n necesita montado como volumen |
| `ngnix/` | Configuracion de NGINX |
| `postgres/migrations/` | Directo bajo `postgres/` — sin subdirectorio `config/` extra porque no hay `pg_hba.conf` personalizado por ahora |
| `rabbitmq/` | Plano — solo dos archivos, no justifica subdirectorios |
| `monitoring/` | Prometheus y Grafana juntos — son inseparables operacionalmente |
| `scripts/` | En raíz — herramientas de desarrollo no ligadas a un único servicio |
| `dist/` | En raíz, gitignored — artefactos de compilación, ruta fija para el volumen Docker |

## 1. Base de Datos — Dos BDs en un Servidor

Un servidor PostgreSQL, **dos bases de datos independientes**:

### `n8n_db` — Motor interno de n8n
- Creada automáticamente por la variable `POSTGRES_DB=n8n_db`
- Gestionada exclusivamente por n8n (no tocar manualmente)
- Contiene: workflows, credenciales cifradas, historial de ejecuciones, usuarios

### `leads_db` — Datos de negocio
- Creada por `postgres/migrations/000_create_databases.sh` (se ejecuta antes del `.sql` por orden alfabético: `000` < `001`)
- Contiene las tablas del sistema de leads

```
leads_db
├── leads # Lead principal con estado del pipeline
├── lead_events # Event sourcing: cada cambio de estado
└── workflow_error_log # Registro de errores del workflow global
```

## 2. Flujo CI/CD y Custom Nodes

### Por qué imagen oficial + volumen (no imagen derivada)

1. **Actualizaciones desacopladas**: cambiar versión de n8n = 1 línea en `docker-compose.yml`
2. **Superficie auditada**: la imagen oficial pasa por los pipelines de Docker Hub
3. **CI más rápido**: solo compilar TypeScript (~seg), no construir imagen Docker (~min)

### Flujo de vida de un Custom Node

```
Editar .ts en n8n/custom-nodes/
    │
    ▼
git push -> CI detecta cambios en n8n/custom-nodes/**
    │
    ├─ npm ci -> lint -> jest --coverage -> tsc
    ├─ npm audit --audit-level=high
    │
    ▼ (solo merge a main, con aprobación)
rsync dist/custom-nodes/ -> servidor:/dist/custom-nodes/
    │
    ▼
docker compose restart n8n-main n8n-worker
    │
    ▼
n8n lee /home/node/.n8n/custom (volumen :ro)
```

### Volumen montado como read-only

```yaml
- ./dist/custom-nodes:/home/node/.n8n/custom:ro
```

El `:ro` garantiza que n8n puede leer los nodos pero no modificar los artefactos compilados.

---

## 2. Seguridad Hardening

| Medida | Implementación |
|---|---|
| No root | `user:` explícito en todos los servicios |
| No new privileges | `security_opt: no-new-privileges:true` |
| Cap drop ALL | `cap_drop: [ALL]` + `cap_add` mínimas |
| Filesystem read-only | `read_only: true` en Postgres, Redis, Prometheus |
| /tmp en RAM | `tmpfs: [/tmp]` |
| Redes internas | `internal: true` en backend-net, db-net, monitoring-net |
| Puerto en loopback | `127.0.0.1:5678:5678` — requiere NGINX delante |
| Versiones fijadas | Nunca `:latest` |
| Payload limitado | `N8N_PAYLOAD_SIZE_MAX=16` MB |

---

## 3. Observabilidad

### Métricas expuestas por n8n (`/metrics`)

Con `N8N_METRICS=true`:

| Métrica | Tipo | Descripción |
|---|---|---|
| `n8n_workflow_executions_total` | Counter | Ejecuciones por workflow y estado |
| `n8n_workflow_execution_duration_seconds` | Histogram | Duración P50/P95/P99 |
| `n8n_active_workflows_total` | Gauge | Workflows activos |
| `n8n_webhook_calls_total` | Counter | Llamadas recibidas |

---

## 4. Gestión de Secretos

### Para la prueba técnica
Archivos `.env.*` no commiteados (`.gitignore` incluye `*.env.*` excepto `*.example.*`).

### Para producción real
**Docker Secrets** (Swarm) o **HashiCorp Vault** (bonus de la prueba):
```bash
vault kv get -field=value secret/n8n/encryption-key
```

---

## 5. Decisiones Técnicas

### Redis (Bull) para n8n + RabbitMQ para leads
n8n en modo queue **requiere** Redis/Bull internamente. RabbitMQ aporta semántica de mensajería de negocio (exchanges, routing keys, DLQ) que Redis no provee. Responsabilidades separadas.

### Dos BDs en un servidor PostgreSQL
Reduce complejidad operativa. Las BDs están aisladas lógicamente. En producción de alta escala se separarían en instancias distintas.

### Imagen oficial n8n + volumen para custom nodes
Actualizaciones independientes, mayor seguridad, menor acoplamiento. Ver §6.

### Redes Docker segmentadas
Si RabbitMQ se compromete (backend-net), no tiene ruta a PostgreSQL (db-net). Si Grafana se compromete (monitoring-net), no accede a colas ni workers.

### `postgres/migrations/` plano (sin subcarpetas)
Solo dos scripts con convención `NNN_nombre`. Con golang-migrate en producción, la carpeta se usa directamente como `--path`.

---

## 6. Mejoras Futuras

1. **Kubernetes + KEDA** — Autoscaling de workers basado en profundidad de cola RabbitMQ
2. **Dead Letter Queue monitoring** — Alertas cuando `leads.dead-letter` acumula mensajes
3. **golang-migrate en CI** — Para aplicar migraciones en entornos ya existentes

---

## 7. Limitaciones Conocidas

| Limitación | Mitigación |
|---|---|
| `initdb.d` solo en primer arranque | Usar golang-migrate en producción |
| Sin TLS entre contenedores | Aceptable en host único; mTLS en clúster multi-nodo |
| Custom nodes requieren reinicio | Rolling restart con réplicas minimiza impacto |
| Sin autoscaling dinámico | Migrar a Kubernetes con KEDA |

---

## 8. Guía de Despliegue

```bash
# 1. Configurar variables de entorno
cp .env.example.n8n       .env.n8n
cp .env.example.postgres  .env.postgres
cp .env.example.redis     .env.redis
cp .env.example.rabbitmq  .env.rabbitmq
# Editar cada fichero con valores reales

# 2. Compilar custom nodes
chmod +x scripts/build-custom-nodes.sh
./scripts/build-custom-nodes.sh

# 3. Levantar el stack
./deploy.sh

# 4. Verificar
docker compose ps
docker compose logs -f n8n-main

# 5. Importar workflows
# Acceder a http://localhost:5678 -> Settings -> Import Workflows
# Cargar los JSON de n8n/workflows/
```
