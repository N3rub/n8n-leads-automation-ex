//
// src/nodes/HashGenerator/HashGenerator.node.ts
//

import type {
  IDataObject,
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { executeHashOperation } from './hash';
import type { HashOperation, HashMode } from './types';
import { HASH_ALGORITHMS, DIGEST_ENCODINGS, HASH_MODES } from './types';

//
// Helpers para construir las opciones de los selects de la UI
//
const algorithmOptions = HASH_ALGORITHMS.map((alg) => ({
  name: alg.toUpperCase(),
  value: alg,
}));

const encodingOptions = DIGEST_ENCODINGS.map((enc) => ({
  name: enc === 'base64url' ? 'Base64 URL-safe' : enc.charAt(0).toUpperCase() + enc.slice(1),
  value: enc,
}));

const modeOptions: Array<{ name: string; value: HashMode; description: string }> = [
  {
    name: 'Campo específico',
    value: 'field',
    description: 'Hashea el valor de un campo del JSON de entrada.',
  },
  {
    name: 'Payload completo',
    value: 'payload',
    description: 'Hashea el JSON de entrada completo (serialización estable con claves ordenadas).',
  },
  {
    name: 'Expresión libre',
    value: 'expression',
    description: 'Hashea el resultado de una expresión n8n arbitraria.',
  },
];

//
// Clase del nodo
//
export class HashGenerator implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Hash Generator',
    name: 'hashGenerator',
    icon: 'fa:hashtag',
    group: ['transform'],
    version: 1,
    description:
      'Genera un digest criptográfico (MD5, SHA-1/256/384/512) de un campo, del payload completo o de una expresión. Soporta múltiples operaciones por item.',
    defaults: {
      name: 'Hash Generator',
      color: '#5C4EE5',
    },
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      //
      // COLECCIÓN DE OPERACIONES
      // Permite al usuario definir N hashes en una sola ejecución del nodo.
      // Cada operación produce un nuevo campo en el JSON de salida.
      //
      {
        displayName: 'Operaciones de Hash',
        name: 'operations',
        type: 'fixedCollection',
        typeOptions: {
          multipleValues: true,
          sortable: true,
          minRequiredFields: 1,
        },
        default: {},
        placeholder: 'Añadir operación',
        description:
          'Define una o más operaciones de hash. Cada una añade un campo al JSON de salida.',
        options: [
          {
            name: 'items',
            displayName: 'Operación',
            values: [
              // Algoritmo
              {
                displayName: 'Algoritmo',
                name: 'algorithm',
                type: 'options',
                options: algorithmOptions,
                default: 'sha256',
                description: 'Función de hash criptográfica a aplicar.',
              },

              // Modo
              {
                displayName: 'Modo',
                name: 'mode',
                type: 'options',
                options: modeOptions,
                default: 'field',
                description: 'Qué valor se usará como entrada del hash.',
              },

              // Campo fuente (modo 'field')
              {
                displayName: 'Campo fuente',
                name: 'sourceField',
                type: 'string',
                default: '',
                placeholder: 'email',
                description:
                  'Nombre del campo del JSON de entrada cuyo valor se hasheará.',
                displayOptions: {
                  show: { mode: ['field'] },
                },
              },

              // Expresión libre (modo 'expression')
              {
                displayName: 'Valor a hashear',
                name: 'sourceExpression',
                type: 'string',
                default: '',
                placeholder: '={{ $json.email + $json.phone }}',
                description:
                  'Expresión n8n cuyo resultado (string) se hasheará. Admite cualquier expresión válida.',
                displayOptions: {
                  show: { mode: ['expression'] },
                },
              },

              // Codificación del digest
              {
                displayName: 'Codificación de salida',
                name: 'encoding',
                type: 'options',
                options: encodingOptions,
                default: 'hex',
                description: 'Formato del string resultante del hash.',
              },

              // Nombre del campo de salida
              {
                displayName: 'Nombre del campo de salida',
                name: 'outputField',
                type: 'string',
                default: 'hash',
                placeholder: 'dedup_hash',
                description:
                  'Nombre del campo que se añadirá (o sobreescribirá) en el JSON de salida con el digest resultante.',
              },
            ],
          },
        ],
      },
    ],
  };

  //
  // EXECUTE — Punto de entrada que llama n8n
  //
  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    const rawOperations = this.getNodeParameter('operations', 0) as {
      items?: Array<{
        algorithm: string;
        mode: string;
        sourceField: string;
        sourceExpression: string;
        encoding: string;
        outputField: string;
      }>;
    };

    const operations = (rawOperations.items ?? []) as HashOperation[];

    if (operations.length === 0) {
      throw new NodeOperationError(
        this.getNode(),
        'HashGenerator: debes definir al menos una operación de hash.',
      );
    }

    // Validamos los valores del enum antes de procesar los items
    // (falla rápido si la config es inválida, en lugar de fallar item a item)
    validateOperations(operations, this);

    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      try {
        const inputJson = items[itemIndex].json as Record<string, unknown>;
        const outputJson: IDataObject = { ...inputJson } as IDataObject;;

        for (const operation of operations) {
          const result = executeHashOperation({
            operation,
            inputJson: inputJson as Readonly<Record<string, unknown>>,
          });
          outputJson[result.outputField] = result.digest;
        }

        returnData.push({
          json: outputJson,
          pairedItem: { item: itemIndex },
        });
      } catch (error) {
        // Permite que n8n muestre el error por item y continúe con el resto
        if (this.continueOnFail()) {
          returnData.push({
            json: {
              ...items[itemIndex].json,
              _hash_error: error instanceof Error ? error.message : String(error),
            },
            pairedItem: { item: itemIndex },
          });
          continue;
        }
        throw new NodeOperationError(this.getNode(), error as Error, { itemIndex });
      }
    }

    return [returnData];
  }
}

//
// Validación de la configuración antes de procesar items
//
function validateOperations(operations: HashOperation[], ctx: IExecuteFunctions): void {
  const validAlgorithms = new Set<string>(HASH_ALGORITHMS);
  const validEncodings = new Set<string>(DIGEST_ENCODINGS);
  const validModes = new Set<string>(HASH_MODES);

  operations.forEach((op, idx) => {
    const label = `Operación #${idx + 1}`;

    if (!validAlgorithms.has(op.algorithm)) {
      throw new NodeOperationError(
        ctx.getNode(),
        `${label}: algoritmo '${op.algorithm}' no soportado. Valores válidos: ${HASH_ALGORITHMS.join(', ')}.`,
      );
    }
    if (!validEncodings.has(op.encoding)) {
      throw new NodeOperationError(
        ctx.getNode(),
        `${label}: codificación '${op.encoding}' no soportada. Valores válidos: ${DIGEST_ENCODINGS.join(', ')}.`,
      );
    }
    if (!validModes.has(op.mode)) {
      throw new NodeOperationError(
        ctx.getNode(),
        `${label}: modo '${op.mode}' no soportado. Valores válidos: ${HASH_MODES.join(', ')}.`,
      );
    }
    if (!op.outputField?.trim()) {
      throw new NodeOperationError(
        ctx.getNode(),
        `${label}: 'outputField' no puede estar vacío.`,
      );
    }
  });
}
