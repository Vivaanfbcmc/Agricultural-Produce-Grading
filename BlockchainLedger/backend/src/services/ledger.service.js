import pool from '../config/database.js';
import HashService from './hash.service.js';

class LedgerService {
  static async createLedgerEntry(transactionData) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      const lastEntryResult = await client.query(
        'SELECT * FROM ledger ORDER BY id DESC LIMIT 1'
      );
      
      const lastEntry = lastEntryResult.rows[0];
      const previousHash = lastEntry ? lastEntry.hash : null;
      const timestamp = new Date().toISOString();
      const hash = HashService.computeHash(transactionData, timestamp, previousHash);

      const insertResult = await client.query(
        `INSERT INTO ledger (data, timestamp, previous_hash, hash)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [JSON.stringify(transactionData), timestamp, previousHash, hash]
      );

      await client.query('COMMIT');
      return insertResult.rows[0];

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async verifyLedger() {
    const result = await pool.query('SELECT * FROM ledger ORDER BY id ASC');
    const entries = result.rows;

    for (let i = 1; i < entries.length; i++) {
      const entry = entries[i];
      const previousEntry = entries[i - 1];
      const data = typeof entry.data === 'string' ? JSON.parse(entry.data) : entry.data;

      const isHashValid = HashService.verifyHash(
        data,
        entry.timestamp,
        entry.previous_hash,
        entry.hash
      );

      if (!isHashValid) {
        return {
          valid: false,
          message: `Hash mismatch at entry #${entry.id}`,
          entry_id: entry.id
        };
      }

      if (entry.previous_hash !== previousEntry.hash) {
        return {
          valid: false,
          message: `Chain broken at entry #${entry.id}`,
          entry_id: entry.id
        };
      }
    }

    return {
      valid: true,
      message: 'All entries verified successfully',
      total_entries: entries.length
    };
  }

  static async getLedgerEntries(limit = 50, offset = 0) {
    const result = await pool.query(
      'SELECT * FROM ledger ORDER BY id DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    return result.rows;
  }
}

export default LedgerService;
