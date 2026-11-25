import pg from 'pg';

export type Db = pg.Pool;
export type Queryable = Pick<pg.PoolClient, 'query'>;

export function createPool(connectionString: string): Db {
  return new pg.Pool({ connectionString, max: 5 });
}

export async function inTransaction<T>(db: Db, work: (tx: pg.PoolClient) => Promise<T>): Promise<T> {
  const tx = await db.connect();
  try {
    await tx.query('BEGIN');
    const result = await work(tx);
    await tx.query('COMMIT');
    return result;
  } catch (err) {
    await tx.query('ROLLBACK');
    throw err;
  } finally {
    tx.release();
  }
}
