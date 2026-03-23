//
// src/nodes/HashGenerator/hash.ts
// Lógica pura de hashing — SIN dependencias de n8n.
// Al ser funciones puras son trivialmente testeables con Jest.
//

import * as crypto from 'crypto';
import type {
  HashAlgorithm,
  DigestEncoding,
  HashResult,
  HashExecutionContext,
} from './types';

//
// Función base: crea el digest a partir de un string de entrada
//
export function createDigest(
  value: string,
  algorithm: HashAlgorithm,
  encoding: DigestEncoding,
): string {
  return crypto.createHash(algorithm).update(value, 'utf8').digest(encoding);
}

//
// Resuelve el string a hashear en función del modo de la operación
//
export function resolveSourceValue(ctx: HashExecutionContext): string {
  const { operation, inputJson } = ctx;

  switch (operation.mode) {
    case 'field': {
      const fieldName = operation.sourceField.trim();
      if (!fieldName) {
        throw new Error(`HashGenerator: 'sourceField' no puede estar vacío en modo 'field'.`);
      }
      const raw = inputJson[fieldName];
      if (raw === undefined || raw === null) {
        throw new Error(
          `HashGenerator: el campo '${fieldName}' no existe en el JSON de entrada o es null.`,
        );
      }
      // Serializa cualquier tipo a string de forma determinista
      return typeof raw === 'string' ? raw : JSON.stringify(raw);
    }

    case 'payload': {
      // Serializa el payload completo de forma determinista (claves ordenadas)
      return stableStringify(inputJson);
    }

    case 'expression': {
      const expr = operation.sourceExpression.trim();
      if (!expr) {
        throw new Error(`HashGenerator: 'sourceExpression' no puede estar vacío en modo 'expression'.`);
      }
      return expr; // El valor ya viene resuelto por el motor de expresiones de n8n
    }

    default: {
      // Exhaustive check: TypeScript garantiza que este bloque nunca se alcanza
      const _exhaustive: never = operation.mode;
      throw new Error(`HashGenerator: modo desconocido '${String(_exhaustive)}'.`);
    }
  }
}

//
// Orquestador: resuelve el valor y produce el resultado de una operación
//
export function executeHashOperation(ctx: HashExecutionContext): HashResult {
  const outputField = ctx.operation.outputField.trim();
  if (!outputField) {
    throw new Error(`HashGenerator: 'outputField' no puede estar vacío.`);
  }

  const sourceValue = resolveSourceValue(ctx);
  const digest = createDigest(sourceValue, ctx.operation.algorithm, ctx.operation.encoding);

  return { outputField, digest };
}

//
// Serialización estable (claves ordenadas) para el modo 'payload'.
// Garantiza que el mismo payload siempre produce el mismo hash,
// independientemente del orden de inserción de las claves en el objeto.
//
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? '';
  }
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  const sortedKeys = Object.keys(value as Record<string, unknown>).sort();
  const pairs = sortedKeys.map(
    (k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`,
  );
  return '{' + pairs.join(',') + '}';
}
