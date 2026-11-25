import type { SourceFile } from '../../api/lambda';

export interface RuntimeTemplate {
  runtime: string;
  label: string;
  handler: string;
  files: SourceFile[];
}

const PYTHON_CODE = `import json


def lambda_handler(event, context):
    print("Evento recebido:", json.dumps(event))
    return {
        "statusCode": 200,
        "body": json.dumps({"mensagem": "Olá do Lambda!"}),
    }
`;

const NODE_CODE = `export const handler = async (event) => {
  console.log('Evento recebido:', JSON.stringify(event));
  return {
    statusCode: 200,
    body: JSON.stringify({ mensagem: 'Olá do Lambda!' }),
  };
};
`;

const python = (runtime: string, label: string): RuntimeTemplate => ({
  runtime,
  label,
  handler: 'lambda_function.lambda_handler',
  files: [{ name: 'lambda_function.py', content: PYTHON_CODE }],
});

const node = (runtime: string, label: string): RuntimeTemplate => ({
  runtime,
  label,
  handler: 'index.handler',
  files: [{ name: 'index.mjs', content: NODE_CODE }],
});

/** Runtimes oferecidos na criação, com o código inicial igual ao do console. */
export const RUNTIMES: readonly RuntimeTemplate[] = [
  python('python3.13', 'Python 3.13'),
  python('python3.12', 'Python 3.12'),
  python('python3.11', 'Python 3.11'),
  node('nodejs22.x', 'Node.js 22.x'),
  node('nodejs20.x', 'Node.js 20.x'),
];

export const runtimeLabel = (runtime: string | null) => RUNTIMES.find((r) => r.runtime === runtime)?.label ?? runtime ?? '-';
