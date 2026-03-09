// BlockchainLedger/backend/src/controllers/transaction.controller.js
import db from '../config/database.js';
import HashService from '../services/hash.service.js';
import LedgerService from '../services/ledger.service.js';

class TransactionController {
  static async createTransaction(req, res) {
    const { farmer_id, produce_name, quantity, ai_grade, price, status = 'verified' } = req.body;

    if (!farmer_id || !produce_name || !quantity || !price) {
      return res.status(400).json({
        error: 'Missing required fields: farmer_id, produce_name, quantity, price'
      });
    }

    try {
      const total_amount = parseFloat(quantity) * parseFloat(price);
      const client = await db.connect();

      try {
        await client.query('BEGIN');

        // Insert transaction
        const txResult = await client.query(
            `INSERT INTO transactions (farmer_id, produce_name, quantity, ai_grade, price, status)
               VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING *`,
            [farmer_id, produce_name, quantity, ai_grade, price, status]
        );

        const transaction = txResult.rows[0];

        // Get previous ledger hash
        const prevHashResult = await client.query(
            'SELECT hash FROM ledger ORDER BY id DESC LIMIT 1'
        );
        const prevHash = prevHashResult.rows.length > 0
            ? prevHashResult.rows[0].hash
            : null;

        // Create ledger data
        const ledgerData = {
          transaction_id: transaction.id,
          farmer_id: transaction.farmer_id,
          produce_name: transaction.produce_name,
          quantity: parseFloat(transaction.quantity),
          ai_grade: transaction.ai_grade,
          price: parseFloat(transaction.price),
          total_amount: total_amount,
          status: transaction.status,
          timestamp: transaction.created_at
        };

        // Calculate current hash
        const dataString = JSON.stringify(ledgerData) + (prevHash || '');
        const crypto = await import('crypto');
        const currentHash = crypto.createHash('sha256').update(dataString).digest('hex');

        // Insert into ledger with JSONB data
        const ledgerResult = await client.query(
            `INSERT INTO ledger (previous_hash, hash, data)
                     VALUES ($1, $2, $3)
                     RETURNING id, hash`,
            [prevHash, currentHash, JSON.stringify(ledgerData)]
        );

        // Update transaction with ledger_entry_id if column exists
        try {
          await client.query(
              `UPDATE transactions SET ledger_entry_id = $1 WHERE id = $2`,
              [ledgerResult.rows[0].id, transaction.id]
          );
        } catch (updateErr) {
          console.log('Note: ledger_entry_id column may not exist in transactions table');
        }

        await client.query('COMMIT');

        res.status(201).json({
          success: true,
          message: 'Transaction created and added to ledger',
          transaction: {
            ...transaction,
            total_amount: total_amount
          },
          ledger_entry_id: ledgerResult.rows[0].id,
          hash: ledgerResult.rows[0].hash
        });

      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

    } catch (error) {
      console.error('Create transaction error:', error);
      res.status(500).json({
        error: 'Failed to create transaction',
        message: error.message
      });
    }
  }

  static async getTransactions(req, res) {
    try {
      const { farmerId } = req.query;

      // Query transactions and join with ledger using JSONB query
      let query = `
        SELECT
          t.id,
          t.farmer_id,
          t.produce_name,
          t.quantity,
          t.ai_grade,
          t.price,
          t.quantity * t.price as total_amount,
          t.status,
          t.created_at,
          l.hash as blockchain_hash,
          l.previous_hash,
          l.created_at as ledger_timestamp
        FROM transactions t
               LEFT JOIN ledger l ON (l.data->>'transaction_id')::integer = t.id
      `;

      let params = [];

      if (farmerId) {
        query += ' WHERE t.farmer_id = $1';
        params.push(farmerId);
      }

      query += ' ORDER BY t.created_at DESC';

      const result = await db.query(query, params);

      res.json({
        success: true,
        count: result.rows.length,
        transactions: result.rows
      });

    } catch (error) {
      console.error('Get transactions error:', error);
      res.status(500).json({
        error: 'Failed to fetch transactions',
        message: error.message
      });
    }
  }

  static async getTransactionById(req, res) {
    try {
      const { id } = req.params;

      const result = await db.query(
          `SELECT
             t.id,
             t.farmer_id,
             t.produce_name,
             t.quantity,
             t.ai_grade,
             t.price,
             t.quantity * t.price as total_amount,
             t.status,
             t.created_at,
             l.hash as blockchain_hash,
             l.previous_hash,
             l.created_at as ledger_timestamp,
             l.data as ledger_data
           FROM transactions t
                  LEFT JOIN ledger l ON (l.data->>'transaction_id')::integer = t.id
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
      console.error('Get transaction error:', error);
      res.status(500).json({
        error: 'Failed to fetch transaction',
        message: error.message
      });
    }
  }

  static async getFarmerStats(req, res) {
    try {
      const { farmerId } = req.params;

      const result = await db.query(
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

      const gradeDistribution = await db.query(
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
        stats: result.rows[0],
        grade_distribution: gradeDistribution.rows
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