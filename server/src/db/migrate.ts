import type { Db } from './pool.js';

/**
 * O banco é um espelho do estado do emulador (que só guarda tudo em memória).
 * Esquema pequeno e idempotente: aplicado a cada início da aplicação.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS s3_buckets (
  name text PRIMARY KEY,
  created_at timestamptz
);

CREATE TABLE IF NOT EXISTS s3_objects (
  bucket text NOT NULL REFERENCES s3_buckets(name) ON DELETE CASCADE,
  key text NOT NULL,
  etag text NOT NULL,
  size bigint NOT NULL,
  content_type text,
  last_modified timestamptz,
  body bytea NOT NULL,
  PRIMARY KEY (bucket, key)
);

CREATE TABLE IF NOT EXISTS dynamodb_tables (
  name text PRIMARY KEY,
  create_input jsonb NOT NULL,
  items_hash text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS dynamodb_items (
  id bigserial PRIMARY KEY,
  table_name text NOT NULL REFERENCES dynamodb_tables(name) ON DELETE CASCADE,
  item jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS dynamodb_items_table_idx ON dynamodb_items(table_name);

CREATE TABLE IF NOT EXISTS sqs_queues (
  name text PRIMARY KEY,
  attributes jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS stored_resources (
  id bigserial PRIMARY KEY,
  service text NOT NULL,
  type text NOT NULL,
  name text NOT NULL,
  data jsonb NOT NULL,
  blob bytea,
  UNIQUE (service, type, name)
);

CREATE TABLE IF NOT EXISTS activity (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  service text NOT NULL,
  action text NOT NULL,
  target text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('success', 'failure')),
  message text
);

-- Porta fixa no host de cada endpoint repassado (bancos, caches): sobrevive aos reinícios.
CREATE TABLE IF NOT EXISTS port_forwards (
  key text PRIMARY KEY,
  local_port int NOT NULL UNIQUE,
  last_seen timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sync_state (
  id int PRIMARY KEY CHECK (id = 1),
  restored_boot_id text,
  last_restore_at timestamptz,
  last_snapshot_at timestamptz,
  last_error text
);
INSERT INTO sync_state (id) VALUES (1) ON CONFLICT DO NOTHING;
`;

export async function migrate(db: Db): Promise<void> {
  await db.query(SCHEMA);
}
