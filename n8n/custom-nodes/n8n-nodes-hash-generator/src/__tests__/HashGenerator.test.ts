//
// src/__tests__/HashGenerator.test.ts
// Tests unitarios de la lógica pura de hashing (hash.ts)
//
// NO se mockeará ninguna dependencia de n8n — los tests validan únicamente
// las funciones puras exportadas desde hash.ts, lo que los hace rápidos,deterministas y sin efectos secundarios.
//

import * as crypto from 'crypto';
import {
  createDigest,
  resolveSourceValue,
  executeHashOperation,
  stableStringify,
} from '../nodes/HashGenerator/hash';
import type { HashExecutionContext, HashOperation } from '../nodes/HashGenerator/types';

//
// Helpers de test
//

function makeContext(
  overrides: Partial<HashOperation>,
  inputJson: Record<string, unknown> = {},
): HashExecutionContext {
  const defaultOp: HashOperation = {
    algorithm: 'sha256',
    mode: 'field',
    sourceField: 'email',
    sourceExpression: '',
    outputField: 'hash',
    encoding: 'hex',
    ...overrides,
  };
  return { operation: defaultOp, inputJson };
}

// Referencia: digest SHA-256 de "hello" en hex
const SHA256_HELLO_HEX = crypto.createHash('sha256').update('hello', 'utf8').digest('hex');
const SHA256_HELLO_B64 = crypto.createHash('sha256').update('hello', 'utf8').digest('base64');
const SHA256_HELLO_B64URL = crypto.createHash('sha256').update('hello', 'utf8').digest('base64url');

//
// createDigest
//

describe('createDigest', () => {
  test.each([
    ['md5',    'hex',      crypto.createHash('md5').update('hello', 'utf8').digest('hex')],
    ['sha1',   'hex',      crypto.createHash('sha1').update('hello', 'utf8').digest('hex')],
    ['sha256', 'hex',      SHA256_HELLO_HEX],
    ['sha256', 'base64',   SHA256_HELLO_B64],
    ['sha256', 'base64url', SHA256_HELLO_B64URL],
    ['sha384', 'hex',      crypto.createHash('sha384').update('hello', 'utf8').digest('hex')],
    ['sha512', 'hex',      crypto.createHash('sha512').update('hello', 'utf8').digest('hex')],
  ] as const)(
    'algoritmo=%s, encoding=%s → digest correcto',
    (algorithm, encoding, expected) => {
      expect(createDigest('hello', algorithm, encoding)).toBe(expected);
    },
  );

  test('el mismo valor siempre produce el mismo digest (determinismo)', () => {
    const a = createDigest('test-value', 'sha256', 'hex');
    const b = createDigest('test-value', 'sha256', 'hex');
    expect(a).toBe(b);
  });

  test('valores distintos producen digests distintos', () => {
    const a = createDigest('foo', 'sha256', 'hex');
    const b = createDigest('bar', 'sha256', 'hex');
    expect(a).not.toBe(b);
  });

  test('string vacío produce un digest válido (no lanza)', () => {
    expect(() => createDigest('', 'sha256', 'hex')).not.toThrow();
    expect(createDigest('', 'sha256', 'hex')).toHaveLength(64); // SHA-256 hex = 64 chars
  });

  test('digest SHA-256 hex tiene siempre 64 caracteres', () => {
    const digest = createDigest('cualquier valor', 'sha256', 'hex');
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  test('digest MD5 hex tiene siempre 32 caracteres', () => {
    const digest = createDigest('cualquier valor', 'md5', 'hex');
    expect(digest).toMatch(/^[0-9a-f]{32}$/);
  });

  test('digest SHA-512 hex tiene siempre 128 caracteres', () => {
    const digest = createDigest('cualquier valor', 'sha512', 'hex');
    expect(digest).toMatch(/^[0-9a-f]{128}$/);
  });

  test('base64url no contiene caracteres +, / ni =', () => {
    // base64url es seguro para URLs — sin +, /, ni padding =
    const digest = createDigest('test', 'sha256', 'base64url');
    expect(digest).not.toMatch(/[+/=]/);
  });
});

//
// stableStringify
//
describe('stableStringify', () => {
  test('dos objetos con el mismo contenido pero distinto orden de claves producen el mismo string', () => {
    const a = { z: 1, a: 2, m: 3 };
    const b = { m: 3, z: 1, a: 2 };
    expect(stableStringify(a)).toBe(stableStringify(b));
  });

  test('serializa primitivos correctamente', () => {
    expect(stableStringify(42)).toBe('42');
    expect(stableStringify('hello')).toBe('"hello"');
    expect(stableStringify(true)).toBe('true');
    expect(stableStringify(null)).toBe('null');
  });

  test('serializa arrays manteniendo el orden (los arrays son ordenados por definición)', () => {
    expect(stableStringify([3, 1, 2])).toBe('[3,1,2]');
  });

  test('serializa objetos anidados de forma estable', () => {
    const obj = { b: { d: 4, c: 3 }, a: { f: 6, e: 5 } };
    const result = stableStringify(obj);
    // Claves de nivel raíz ordenadas: a, b
    expect(result).toBe('{"a":{"e":5,"f":6},"b":{"c":3,"d":4}}');
  });

  test('el hash del payload completo es determinista independientemente del orden de claves', () => {
    const payload1 = { email: 'test@test.com', name: 'Ana', age: 30 };
    const payload2 = { age: 30, email: 'test@test.com', name: 'Ana' };

    const hash1 = createDigest(stableStringify(payload1), 'sha256', 'hex');
    const hash2 = createDigest(stableStringify(payload2), 'sha256', 'hex');

    expect(hash1).toBe(hash2);
  });
});

//
// resolveSourceValue - modo 'field'
//
describe('resolveSourceValue — modo field', () => {
  test('devuelve el string del campo directamente', () => {
    const ctx = makeContext({ mode: 'field', sourceField: 'email' }, { email: 'user@example.com' });
    expect(resolveSourceValue(ctx)).toBe('user@example.com');
  });

  test('serializa a JSON si el valor del campo no es string', () => {
    const ctx = makeContext({ mode: 'field', sourceField: 'meta' }, { meta: { score: 99 } });
    expect(resolveSourceValue(ctx)).toBe(JSON.stringify({ score: 99 }));
  });

  test('lanza si el campo no existe en el JSON de entrada', () => {
    const ctx = makeContext({ mode: 'field', sourceField: 'missing_field' }, { email: 'x@x.com' });
    expect(() => resolveSourceValue(ctx)).toThrow("campo 'missing_field' no existe");
  });

  test('lanza si el campo es null', () => {
    const ctx = makeContext({ mode: 'field', sourceField: 'nulo' }, { nulo: null });
    expect(() => resolveSourceValue(ctx)).toThrow("campo 'nulo' no existe");
  });

  test('lanza si sourceField está vacío', () => {
    const ctx = makeContext({ mode: 'field', sourceField: '   ' }, { email: 'x@x.com' });
    expect(() => resolveSourceValue(ctx)).toThrow("'sourceField' no puede estar vacío");
  });

  test('el valor 0 (número falsy) NO lanza — se serializa correctamente', () => {
    const ctx = makeContext({ mode: 'field', sourceField: 'count' }, { count: 0 });
    expect(resolveSourceValue(ctx)).toBe('0');
  });

  test('el valor false (booleano falsy) NO lanza', () => {
    const ctx = makeContext({ mode: 'field', sourceField: 'active' }, { active: false });
    expect(resolveSourceValue(ctx)).toBe('false');
  });
});

//
// resolveSourceValue - modo 'payload'
//
describe('resolveSourceValue — modo payload', () => {
  test('devuelve la serialización estable del payload completo', () => {
    const inputJson = { b: 2, a: 1 };
    const ctx = makeContext({ mode: 'payload' }, inputJson);
    expect(resolveSourceValue(ctx)).toBe(stableStringify(inputJson));
  });

  test('funciona con payload vacío', () => {
    const ctx = makeContext({ mode: 'payload' }, {});
    expect(resolveSourceValue(ctx)).toBe('{}');
  });
});

//
// resolveSourceValue - modo 'expression'
//
describe('resolveSourceValue — modo expression', () => {
  test('devuelve la expresión ya resuelta tal cual (n8n la resuelve antes)', () => {
    // En n8n las expresiones se resuelven antes de llegar al nodo.
    // En este contexto el valor ya llegará como string resuelto.
    const ctx = makeContext({ mode: 'expression', sourceExpression: 'user@example.com:+34600000000' });
    expect(resolveSourceValue(ctx)).toBe('user@example.com:+34600000000');
  });

  test('lanza si la expresión está vacía', () => {
    const ctx = makeContext({ mode: 'expression', sourceExpression: '   ' });
    expect(() => resolveSourceValue(ctx)).toThrow("'sourceExpression' no puede estar vacío");
  });
});

//
// executeHashOperation - integración de las piezas
//
describe('executeHashOperation', () => {
  test('produce el outputField y digest correctos en modo field', () => {
    const ctx = makeContext(
      { mode: 'field', sourceField: 'email', outputField: 'email_hash', algorithm: 'sha256', encoding: 'hex' },
      { email: 'hello' },
    );
    const result = executeHashOperation(ctx);
    expect(result.outputField).toBe('email_hash');
    expect(result.digest).toBe(SHA256_HELLO_HEX);
  });

  test('produce el outputField correcto en modo payload', () => {
    const inputJson = { email: 'hello' };
    const ctx = makeContext(
      { mode: 'payload', outputField: 'payload_hash', algorithm: 'sha256', encoding: 'hex' },
      inputJson,
    );
    const result = executeHashOperation(ctx);
    expect(result.outputField).toBe('payload_hash');
    expect(result.digest).toBe(createDigest(stableStringify(inputJson), 'sha256', 'hex'));
  });

  test('produce el outputField correcto en modo expression', () => {
    const ctx = makeContext(
      { mode: 'expression', sourceExpression: 'hello', outputField: 'expr_hash', algorithm: 'sha256', encoding: 'hex' },
    );
    const result = executeHashOperation(ctx);
    expect(result.outputField).toBe('expr_hash');
    expect(result.digest).toBe(SHA256_HELLO_HEX);
  });

  test('lanza si outputField está vacío', () => {
    const ctx = makeContext({ outputField: '   ' }, { email: 'x@x.com' });
    expect(() => executeHashOperation(ctx)).toThrow("'outputField' no puede estar vacío");
  });

  test('múltiples algoritmos sobre el mismo valor producen digests distintos', () => {
    const input = { email: 'hello' };
    const sha256 = executeHashOperation(makeContext({ algorithm: 'sha256', outputField: 'h' }, input));
    const sha512 = executeHashOperation(makeContext({ algorithm: 'sha512', outputField: 'h' }, input));
    const md5    = executeHashOperation(makeContext({ algorithm: 'md5',    outputField: 'h' }, input));

    expect(sha256.digest).not.toBe(sha512.digest);
    expect(sha256.digest).not.toBe(md5.digest);
    expect(sha512.digest).not.toBe(md5.digest);
  });

  test('misma operación sobre dos items distintos produce digests distintos', () => {
    const op: Partial<HashOperation> = { mode: 'field', sourceField: 'v', outputField: 'h' };
    const r1 = executeHashOperation(makeContext(op, { v: 'alice' }));
    const r2 = executeHashOperation(makeContext(op, { v: 'bob' }));
    expect(r1.digest).not.toBe(r2.digest);
  });

  test('caso de uso real: hash de deduplicación email+phone (modo expression)', () => {
    const email = 'usuario@empresa.com';
    const phone = '+34600123456';
    const combined = `${email}:${phone}`;

    const ctx = makeContext(
      {
        mode: 'expression',
        sourceExpression: combined,
        algorithm: 'sha256',
        encoding: 'hex',
        outputField: 'dedup_hash',
      },
    );
    const result = executeHashOperation(ctx);

    // Verificamos contra el cálculo de referencia
    const expected = crypto.createHash('sha256').update(combined, 'utf8').digest('hex');
    expect(result.digest).toBe(expected);
    expect(result.outputField).toBe('dedup_hash');
  });

  test('lanza con mensaje claro si el modo es un valor desconocido (exhaustive check en runtime)', () => {
    // Simula un valor inválido que TypeScript nunca permitiría, pero que
    // podría llegar si el nodo recibe datos corruptos o desde JavaScript puro.
    const ctx = makeContext(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { mode: 'unknown_mode' as any, outputField: 'h' },
      { email: 'x@x.com' },
    );
    expect(() => resolveSourceValue(ctx)).toThrow("modo desconocido 'unknown_mode'");
  });
});
