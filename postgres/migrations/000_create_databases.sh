#!/usr/bin/env bash
set -euo pipefail

echo ">>> Configurando privilegios para ${APP_DB_USER}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-SQL
    -- 1. Crear usuarios (si no existen) con contraseñas de env
    DO \$\$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${APP_DB_USER}') THEN
        CREATE ROLE ${APP_DB_USER} WITH LOGIN PASSWORD '${APP_DB_PASSWORD}';
      END IF;
      IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${READONLY_DB_USER}') THEN
        CREATE ROLE ${READONLY_DB_USER} WITH LOGIN PASSWORD '${READONLY_DB_PASSWORD}';
      END IF;
    END
    \$\$;

    -- 2. Asegurar que n8n_user es dueño de la base de datos de n8n
    -- Esto permite crear extensiones (uuid-ossp) y tablas de migración
    ALTER DATABASE ${POSTGRES_DB} OWNER TO ${APP_DB_USER};
    GRANT ALL PRIVILEGES ON DATABASE ${POSTGRES_DB} TO ${APP_DB_USER};

    -- 3. Crear base de datos de negocio
    SELECT 'CREATE DATABASE leads_db ENCODING ''UTF8'' TEMPLATE template0'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'leads_db')\gexec

    -- 4. Dar permisos en la base de datos de negocio
    ALTER DATABASE leads_db OWNER TO ${APP_DB_USER};
    GRANT CONNECT ON DATABASE leads_db TO ${READONLY_DB_USER};
SQL

echo ">>> Privilegios configurados correctamente"
