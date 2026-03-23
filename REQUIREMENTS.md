# Prueba Técnica — Especialista N8N (Nivel Experto)
**Empresa:** AICOR Consultores Informáticos, S.L.U.  
**Departamento:** Desarrollo  
**Fecha:** 11 de marzo de 2026  
**Tiempo estimado:** 24–36 horas

---

## Objetivo General

Diseñar y desplegar un **sistema automatizado de procesamiento de leads y sincronización CRM** basado en eventos.

El sistema debe:
1. Recibir leads desde un webhook
2. Validarlos y enriquecerlos
3. Guardarlos en base de datos
4. Publicarlos en un sistema de colas
5. Sincronizarlos con un CRM
6. Gestionar errores y reintentos
7. Exponer métricas de ejecución

El flujo debe diseñarse siguiendo buenas prácticas de arquitectura de workflows en n8n.

---

## Contexto del Caso

Una empresa recibe leads desde múltiples fuentes (formularios web, campañas, partners). El sistema actual requiere una automatización que:

- Reciba leads en tiempo real
- Valide y normalice datos
- Detecte duplicados
- Enrute leads a diferentes sistemas
- Permita observabilidad y trazabilidad

El sistema debe diseñarse pensando en **escalabilidad y producción**.

---

## Entregables Obligatorios

| Entregable | Descripción |
|---|---|
| **Workflows n8n (JSON)** | Exportados desde la UI de n8n |
| **Repositorio** | Incluye docker-compose, scripts y documentación |
| **Documento técnico** | Arquitectura, decisiones técnicas, mejoras posibles, limitaciones |

---

## Arquitectura Requerida

### Workflow 1 — Ingesta de Leads
1. Validar datos
2. Normalizar email
3. Añadir timestamp
4. Crear ID único
5. Enviar evento a cola

### Workflow 2 — Procesamiento de Lead
1. Leer mensaje de la cola
2. Comprobar duplicados en base de datos
3. Enriquecer datos usando una API externa
4. Guardar en base de datos

**Bases de datos soportadas:** PostgreSQL · MySQL · MongoDB

### Workflow 3 — Sincronización CRM
1. Tomar leads nuevos
2. Enviarlos a un CRM
3. Manejar errores, retries y rate limiting

**CRMs válidos:** HubSpot · Salesforce · Odoo · API mock · Workdo

---

## Requisitos Técnicos Obligatorios

### 1. Uso Avanzado de N8N
**Nodos requeridos:**
- Webhook trigger
- Queue trigger
- HTTP Request
- IF / Switch
- Merge
- Error workflow
- Function node

**Demostraciones requeridas:**
- Uso de expresiones
- Manipulación JSON
- Lógica condicional

### 2. Nodo Personalizado (Custom Node)
Crear un custom node de n8n que realice alguna de estas funciones:
- Validar emails
- Generar hashes
- Transformar datos

**Se evaluará:** estructura del nodo · tipado · documentación

### 3. Manejo de Credenciales
- Usar credenciales de n8n
- Usar variables de entorno

**Bonus:** Integración con HashiCorp Vault o AWS Secrets Manager

### 4. Base de Datos
- Inserción
- Búsqueda
- Prevención de duplicados

### 5. Sistema de Colas
**Tecnología:** RabbitMQ o Kafka

**Demostrar:**
- Publicación de eventos
- Consumo de mensajes
- Manejo de errores

### 6. Manejo de Errores
Workflow de error global que registre:
- Mensaje de error
- Timestamp
- Nombre del workflow
- Payload original

**Opciones de almacenamiento:** base de datos · Redis · logs

### 7. Observabilidad
Implementar al menos una de estas opciones:

**Opción A:** Prometheus metrics export  
**Opción B:** Logs estructurados para Grafana

**Métricas mínimas:**
- Total de ejecuciones
- Total de errores
- Duración de workflows

### 8. Seguridad
- Validación de payload
- Sanitización de datos
- Rate limiting
- Ocultación de secrets

**Opcional:** Verificación JWT

### 9. DevOps
Entregar un `docker-compose` que incluya:
- n8n (main + worker)
- Base de datos
- Sistema de colas
- Redis (opcional)

**Scripts adicionales:** JavaScript o Python

---

## Criterios de Evaluación

| Área | Peso |
|---|---|
| Capacidad de diseño de automatizaciones complejas | Alto |
| Manejo de APIs y autenticación | Alto |
| Integración con bases de datos | Alto |
| Gestión de mensajería asíncrona | Alto |
| Buenas prácticas de seguridad | Medio |
| Observabilidad | Medio |
| DevOps y despliegue | Medio |
| Capacidad de estructurar workflows mantenibles | Alto |

> **Nota:** En caso de que el candidato no pueda completar la prueba, se evaluará hasta el punto que haya podido desarrollar.
