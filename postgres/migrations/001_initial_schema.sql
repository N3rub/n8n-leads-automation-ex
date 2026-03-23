-
-- migrations/001_initial_schema.sql
-- IMPORTANTE: Este script corre en leads_db (NO en n8n_db).
-- 000_create_databases.sh crea leads_db primero (orden alfabético).
\connect leads_db

--
-- Migración inicial: esquema completo del sistema de leads
--
-- PostgreSQL ejecuta los ficheros de /docker-entrypoint-initdb.d en ese orden.
--

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; -- UUIDs v4
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- MD5/SHA para deduplicación
CREATE EXTENSION IF NOT EXISTS "citext"; -- Emails case-insensitive


-- TABLA: leads — Almacena todos los leads procesados por el sistema

CREATE TABLE IF NOT EXISTS leads (
 -- Identificación
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 external_id TEXT NOT NULL UNIQUE, -- ID único generado en Workflow 1
 dedup_hash TEXT NOT NULL UNIQUE, -- SHA256(email_normalized+phone) para deduplicación

 -- Datos del lead
 email CITEXT NOT NULL, -- CITEXT: case-insensitive comparison
 email_normalized TEXT NOT NULL, -- email en minúsculas, sin espacios
 first_name TEXT,
 last_name TEXT,
 phone TEXT,
 company TEXT,
 source TEXT NOT NULL DEFAULT 'unknown', -- web_form | campaign | partner
 utm_source TEXT,
 utm_medium TEXT,
 utm_campaign TEXT,

 -- Datos enriquecidos (Workflow 2)
 -- Eliminados company_domain y linkedin_url: se almacenan dentro de enriched_data (JSONB)
 -- para no acoplar el schema a una API de enriquecimiento concreta.
 -- Acceso: enriched_data->>'company_domain', enriched_data->'person'->>'linkedin'
 enriched_data JSONB, -- Respuesta completa de API de enriquecimiento

 -- Estado del pipeline
 status TEXT NOT NULL DEFAULT 'received' -- received | processing | enriched | synced | error | duplicate
 CHECK (status IN ('received','processing','enriched','synced','error','duplicate')),
 crm_id TEXT, -- ID en el CRM externo (HubSpot/Odoo)
 crm_synced_at TIMESTAMPTZ,

 -- Auditoría
 raw_payload JSONB NOT NULL, -- Payload original del webhook. Inmutable tras inserción.
 error_message TEXT,
 retry_count SMALLINT NOT NULL DEFAULT 0,
 ingested_at TIMESTAMPTZ, -- Cuándo llegó al webhook (Workflow 1) — distinto de created_at
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- Cuándo se insertó en BD (Workflow 2)
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 processed_at TIMESTAMPTZ
);


-- TABLA: lead_events — Event sourcing (PENDIENTE DE IMPLEMENTACIÓN)
-- Diseñada para registrar cada transición de estado del lead a través del pipeline.
-- Actualmente no se escribe desde los workflows — los estados se leen directamente
-- de leads.status. Implementación futura: INSERT en cada cambio de status.

CREATE TABLE IF NOT EXISTS lead_events (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
 event_type TEXT NOT NULL, -- RECEIVED | VALIDATED | ENRICHED | CRM_SYNCED | ERROR
 workflow_name TEXT,
 payload JSONB,
 error_detail JSONB,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- TABLA: workflow_error_log — Log global de errores de workflows (Requisito §6)

CREATE TABLE IF NOT EXISTS workflow_error_log (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 workflow_id TEXT NOT NULL,
 workflow_name TEXT,
 execution_id TEXT,
 error_message TEXT NOT NULL,
 error_stack TEXT,
 payload JSONB,
 node_name TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ÍNDICES — Optimización de consultas frecuentes

CREATE INDEX IF NOT EXISTS idx_leads_email ON leads (email);
CREATE INDEX IF NOT EXISTS idx_leads_dedup_hash ON leads (dedup_hash);
CREATE INDEX IF NOT EXISTS idx_leads_external_id ON leads (external_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads (status);
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads (source);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_ingested_at ON leads (ingested_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_events_lead_id ON lead_events (lead_id);
CREATE INDEX IF NOT EXISTS idx_error_log_workflow ON workflow_error_log (workflow_id, created_at DESC);


-- FUNCIÓN: updated_at automático via trigger

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
 NEW.updated_at = NOW();
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_leads_updated_at
 BEFORE UPDATE ON leads
 FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- PERMISOS — Usuarios de aplicación con acceso mínimo necesario

GRANT CONNECT ON DATABASE leads_db TO n8n_user;
GRANT USAGE ON SCHEMA public TO n8n_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON leads TO n8n_user;;
GRANT SELECT, INSERT, UPDATE, DELETE ON lead_events TO n8n_user;
GRANT SELECT, INSERT, DELETE ON workflow_error_log TO n8n_user;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO n8n_user;

-- Usuario de solo lectura para Grafana/monitorización
GRANT CONNECT ON DATABASE leads_db TO grafana_reader;
GRANT USAGE ON SCHEMA public TO grafana_reader;
GRANT SELECT ON leads, lead_events, workflow_error_log TO grafana_reader;





-- COMENTARIOS

COMMENT ON TABLE leads IS 'Almacena todos los leads procesados. Núcleo del sistema.';
COMMENT ON COLUMN leads.external_id IS 'UUID v4 generado en Workflow 1 (ingesta). Único e inmutable.';
COMMENT ON COLUMN leads.dedup_hash IS 'SHA256(email_normalized || ":" || phone). Evita duplicados. Generado por el custom node HashGenerator.';
COMMENT ON COLUMN leads.raw_payload IS 'Payload original del webhook. Inmutable tras inserción.';
COMMENT ON COLUMN leads.enriched_data IS 'Respuesta completa de la API de enriquecimiento en JSONB. Acceso: enriched_data->''person''->>''linkedin'', enriched_data->''company''->>''name''.';
COMMENT ON COLUMN leads.ingested_at IS 'Timestamp de cuando el lead llegó al webhook (Workflow 1). Puede diferir de created_at si hubo retraso en la cola.';
