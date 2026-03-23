//
// src/nodes/HashGenerator/types.ts
// Tipos compartidos del nodo HashGenerator — fuertemente tipados, sin 'any'.
//

//
// Algoritmos de hash soportados por Node.js crypto (seleccionables en la UI)
//
export const HASH_ALGORITHMS = ['md5', 'sha1', 'sha256', 'sha384', 'sha512'] as const;
export type HashAlgorithm = (typeof HASH_ALGORITHMS)[number];

//
// Codificación del digest resultante
//
export const DIGEST_ENCODINGS = ['hex', 'base64', 'base64url'] as const;
export type DigestEncoding = (typeof DIGEST_ENCODINGS)[number];

//
// Modos de operación del nodo
//
export const HASH_MODES = ['field', 'payload', 'expression'] as const;
export type HashMode = (typeof HASH_MODES)[number];

//
// Definición de una operación de hash (una "Hash Operation" en la UI)
// Un item de n8n puede ejecutar N operaciones en una sola pasada.
//
export interface HashOperation {
  /** Algoritmo criptográfico a usar. */
  algorithm: HashAlgorithm;

  /** Modo de operación: campo, payload completo o expresión libre. */
  mode: HashMode;

  /**
   * Nombre del campo del JSON de entrada a hashear.
   * Solo relevante cuando mode === 'field'.
   */
  sourceField: string;

  /**
   * Valor literal/expresión n8n a hashear.
   * Solo relevante cuando mode === 'expression'.
   */
  sourceExpression: string;

  /** Nombre del campo de salida donde se escribirá el digest resultante. */
  outputField: string;

  /** Codificación del digest: 'hex' | 'base64' | 'base64url'. */
  encoding: DigestEncoding;
}

//
// Resultado interno de ejecutar una operación sobre un valor
//
export interface HashResult {
  outputField: string;
  digest: string;
}

//
// Contexto de ejecución pasado a la función pura de hashing
// (facilita el testing sin depender del contexto de n8n)
//
export interface HashExecutionContext {
  operation: HashOperation;
  /** JSON de entrada del item actual (sin mutar). */
  inputJson: Readonly<Record<string, unknown>>;
}
