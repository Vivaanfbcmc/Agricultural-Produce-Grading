import pool from '../config/database.js';
import LedgerService from '../services/ledger.service.js';

class TransactionController {
  static async createTransaction(req, res) {
    const { farmer_id, produce_name, quantity, ai_grade, price, farmerName } = req.body;

    if (!farmer_id || !produce_name || !quantity || !ai_grade || !price) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const transactionData = {
        farmer_id,
        produce_name,
        quantity: parseFloat(quantity),
        ai_grade,
        price: parseFloat(price),
        farmerName: farmerName || farmer_id, // Use farmer_id as fallback if name not provided
        timestamp: new Date().toISOString()
      };

      const ledgerEntry = await LedgerService.createLedgerEntry(transactionData);

      const txResult = await client.query(
        `INSERT INTO transactions 
         (farmer_id, produce_name, quantity, ai_grade, price, ledger_entry_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [farmer_id, produce_name, quantity, ai_grade, price, ledgerEntry.id]
      );

      await client.query('COMMIT');

      res.status(201).json({
        transaction: txResult.rows[0],
        ledger_entry_id: ledgerEntry.id,
        hash: ledgerEntry.hash,
        blockchain_tx_hash: ledgerEntry.blockchain_tx_hash,
        block_number: ledgerEntry.block_number
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Transaction creation error:', error);
      res.status(500).json({ error: error.message });
    } finally {
      client.release();
    }
  }

  static async getTransactionsByFarmer(req, res) {
    const { farmer_id } = req.params;

    try {
      const result = await pool.query(
        `SELECT * FROM transactions 
         WHERE farmer_id = $1 
         ORDER BY created_at DESC`,
        [farmer_id]
      );

      res.json({ transactions: result.rows });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getAllTransactions(req, res) {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    try {
      const result = await pool.query(
        `SELECT t.*, l.hash as ledger_hash
         FROM transactions t
         JOIN ledger l ON t.ledger_entry_id = l.id
         ORDER BY t.created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      res.json({ transactions: result.rows });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

export default TransactionController;
