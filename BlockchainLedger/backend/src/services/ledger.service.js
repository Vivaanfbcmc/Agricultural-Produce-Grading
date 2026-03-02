import pool from '../config/database.js';
import HashService from './hash.service.js';
import BlockchainService from './blockchain.service.js';

class LedgerService {

  // ── Shared helper: insert ledger + anchor blockchain + store proof ─────
  static async #buildLedgerEntry(client, transactionData) {

    // 1. Get last ledger entry for hash chaining
    const lastEntryResult = await client.query(
      'SELECT * FROM ledger ORDER BY id DESC LIMIT 1'
    );

    const lastEntry = lastEntryResult.rows[0];
    const previousHash = lastEntry ? lastEntry.hash : null;
    const timestamp = new Date().toISOString();
    const hash = HashService.computeHash(transactionData, timestamp, previousHash);

    // 2. Insert into ledger (immutable — never touched again)
    const insertResult = await client.query(
      `INSERT INTO ledger (data, timestamp, previous_hash, hash)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [JSON.stringify(transactionData), timestamp, previousHash, hash]
    );

    const insertedEntry = insertResult.rows[0];
    const farmerName = transactionData.farmerName || "system";

    // 3. Anchor to Sepolia blockchain
    const blockchainProof = await BlockchainService.anchorLedger(
      insertedEntry.id,
      insertedEntry.hash,
      farmerName
    );

    // 4. Store proof in separate table (no immutability conflict)
    await client.query(
      `INSERT INTO ledger_blockchain_proof (ledger_id, blockchain_tx_hash, block_number)
       VALUES ($1, $2, $3)`,
      [insertedEntry.id, blockchainProof.txHash, blockchainProof.blockNumber]
    );

    return { entry: insertedEntry, blockchainProof };
  }

  // ── Create ledger entry only ───────────────────────────────────────────
  static async createLedgerEntry(transactionData) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { entry, blockchainProof } = 
        await LedgerService.#buildLedgerEntry(client, transactionData);

      await client.query('COMMIT');

      return {
        ...entry,
        blockchain_tx_hash: blockchainProof.txHash,
        block_number: blockchainProof.blockNumber
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ── Create full transaction (ledger + blockchain proof + transaction) ───
  static async createTransactionEntry(transactionData) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Build ledger + blockchain proof
      const { entry: ledgerEntry, blockchainProof } =
        await LedgerService.#buildLedgerEntry(client, transactionData);

      // 2. Insert into transactions table
      const insertTransaction = await client.query(
        `INSERT INTO transactions
           (farmer_id, produce_name, quantity, ai_grade, price, ledger_entry_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          transactionData.farmerId,
          transactionData.produceName,
          transactionData.quantity,
          transactionData.aiGrade,
          transactionData.price,
          ledgerEntry.id,
          transactionData.status || 'verified'
        ]
      );

      await client.query('COMMIT');

      return {
        transaction: insertTransaction.rows[0],
        ledger: {
          ...ledgerEntry,
          blockchain_tx_hash: blockchainProof.txHash,
          block_number: blockchainProof.blockNumber
        }
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ── Get all ledger entries with blockchain proof ───────────────────────
  static async getAllEntries() {
    try {
      const result = await pool.query(
        `SELECT 
           l.*,
           p.blockchain_tx_hash,
           p.block_number,
           p.anchored_at
         FROM ledger l
         LEFT JOIN ledger_blockchain_proof p ON l.id = p.ledger_id
         ORDER BY l.id ASC`
      );
      return result.rows;
    } catch (error) {
      throw new Error(`Failed to fetch ledger entries: ${error.message}`);
    }
  }

  // ── Get all transactions (uses the view) ──────────────────────────────
  static async getAllTransactions() {
    try {
      const result = await pool.query(
        'SELECT * FROM transaction_full_view ORDER BY created_at DESC'
      );
      return result.rows;
    } catch (error) {
      throw new Error(`Failed to fetch transactions: ${error.message}`);
    }
  }

  // ── Get single transaction by ID ───────────────────────────────────────
  static async getTransactionById(id) {
    try {
      const result = await pool.query(
        'SELECT * FROM transaction_full_view WHERE transaction_id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        throw new Error(`Transaction ${id} not found`);
      }

      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to fetch transaction: ${error.message}`);
    }
  }

  // ── Get transactions by farmer ID ──────────────────────────────────────
  static async getTransactionsByFarmer(farmerId) {
    try {
      const result = await pool.query(
        'SELECT * FROM transaction_full_view WHERE farmer_id = $1 ORDER BY created_at DESC',
        [farmerId]
      );
      return result.rows;
    } catch (error) {
      throw new Error(`Failed to fetch farmer transactions: ${error.message}`);
    }
  }

  // ── Get transactions by grade ──────────────────────────────────────────
  static async getTransactionsByGrade(grade) {
    try {
      const result = await pool.query(
        'SELECT * FROM transaction_full_view WHERE ai_grade = $1 ORDER BY created_at DESC',
        [grade]
      );
      return result.rows;
    } catch (error) {
      throw new Error(`Failed to fetch transactions by grade: ${error.message}`);
    }
  }

  // ── Verify ledger entry against blockchain ─────────────────────────────
  static async verifyEntry(id) {
    try {
      const result = await pool.query(
        `SELECT 
           l.*,
           p.blockchain_tx_hash,
           p.block_number
         FROM ledger l
         LEFT JOIN ledger_blockchain_proof p ON l.id = p.ledger_id
         WHERE l.id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        throw new Error(`Ledger entry ${id} not found`);
      }

      const entry = result.rows[0];
      const isValid = await BlockchainService.verifyHashOnChain(id, entry.hash);

      return {
        id:                   entry.id,
        hash:                 entry.hash,
        blockchain_tx_hash:   entry.blockchain_tx_hash,
        block_number:         entry.block_number,
        isValid
      };

    } catch (error) {
      throw new Error(`Verification failed: ${error.message}`);
    }
  }
}

export default LedgerService;