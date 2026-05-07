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
        farmerName: farmerName || farmer_id,
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

  // ============ NEW FUNCTIONS FOR HISTORY PAGE ============

  static async getTransactionHistory(req, res) {
    const { farmerId } = req.query;

    try {
      let query = `
        SELECT 
          t.id,
          t.farmer_id,
          t.produce_name,
          t.quantity,
          t.ai_grade,
          t.price,
          t.quantity * t.price as total_amount,
          t.created_at,
          l.hash as blockchain_hash,
          l.previous_hash
        FROM transactions t
        LEFT JOIN ledger l ON t.ledger_entry_id = l.id
      `;

      let params = [];

      if (farmerId) {
        query += ' WHERE t.farmer_id = $1';
        params.push(farmerId);
      }

      query += ' ORDER BY t.created_at DESC';

      const result = await pool.query(query, params);

      res.json({
        success: true,
        count: result.rows.length,
        transactions: result.rows
      });

    } catch (error) {
      console.error('Get transaction history error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch transaction history',
        message: error.message
      });
    }
  }

  static async getTransactionById(req, res) {
    const { id } = req.params;

    try {
      const result = await pool.query(
          `SELECT 
          t.id,
          t.farmer_id,
          t.produce_name,
          t.quantity,
          t.ai_grade,
          t.price,
          t.quantity * t.price as total_amount,
          t.created_at,
          l.hash as blockchain_hash,
          l.previous_hash,
          l.data as ledger_data
        FROM transactions t
        LEFT JOIN ledger l ON t.ledger_entry_id = l.id
        WHERE t.id = $1`,
          [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Transaction not found' });
      }

      res.json({
        success: true,
        transaction: result.rows[0]
      });

    } catch (error) {
      console.error('Get transaction by ID error:', error);
      res.status(500).json({
        error: 'Failed to fetch transaction',
        message: error.message
      });
    }
  }

  static async getFarmerStats(req, res) {
    const { farmerId } = req.params;

    try {
      const statsResult = await pool.query(
          `SELECT 
          COUNT(*) as total_transactions,
          SUM(quantity * price) as total_revenue,
          AVG(price) as average_price,
          SUM(quantity) as total_quantity,
          COUNT(DISTINCT produce_name) as produce_types
        FROM transactions
        WHERE farmer_id = $1`,
          [farmerId]
      );

      const gradeResult = await pool.query(
          `SELECT 
          ai_grade,
          COUNT(*) as count
        FROM transactions
        WHERE farmer_id = $1
        GROUP BY ai_grade
        ORDER BY count DESC`,
          [farmerId]
      );

      res.json({
        success: true,
        farmer_id: farmerId,
        stats: statsResult.rows[0],
        grade_distribution: gradeResult.rows
      });

    } catch (error) {
      console.error('Get farmer stats error:', error);
      res.status(500).json({
        error: 'Failed to fetch farmer statistics',
        message: error.message
      });
    }
  }
}

export default TransactionController;