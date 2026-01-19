const crypto = require('crypto');
const { pool } = require('../config/database');

/**
 * Service to manage blockchain ledger operations
 * Handles hashing, verification, and ledger entry creation
 */
class LedgerService {
    /**
     * Compute SHA-256 hash for ledger entry
     */
    static computeHash(data, timestamp, previousHash = null) {
        const input = JSON.stringify(data) + timestamp + (previousHash || '');
        return crypto.createHash('sha256').update(input).digest('hex');
    }

    /**
     * Verify hash integrity
     */
    static verifyHash(data, timestamp, previousHash, storedHash) {
        const computed = this.computeHash(data, timestamp, previousHash);
        return computed === storedHash;
    }

    /**
     * Create a new immutable ledger entry
     * Links farmer transaction with blockchain
     */
    static async createLedgerEntry(transactionData, farmerId) {
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');

            // Get last entry for chain linking
            const lastEntryResult = await client.query(
                'SELECT * FROM ledger ORDER BY id DESC LIMIT 1'
            );
            
            const lastEntry = lastEntryResult.rows[0];
            const previousHash = lastEntry ? lastEntry.hash : null;
            const timestamp = new Date().toISOString();
            const hash = this.computeHash(transactionData, timestamp, previousHash);

            // Insert new ledger entry
            const insertResult = await client.query(
                `INSERT INTO ledger (
                    farmer_id,
                    data, 
                    timestamp, 
                    previous_hash, 
                    hash,
                    created_at
                )
                VALUES ($1, $2, $3, $4, $5, NOW())
                RETURNING *`,
                [farmerId, JSON.stringify(transactionData), timestamp, previousHash, hash]
            );

            await client.query('COMMIT');
            return {
                success: true,
                data: insertResult.rows[0],
                message: 'Ledger entry created successfully'
            };

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Verify entire blockchain ledger integrity
     */
    static async verifyLedger() {
        try {
            const result = await pool.query(
                'SELECT * FROM ledger ORDER BY id ASC'
            );
            const entries = result.rows;

            if (entries.length === 0) {
                return {
                    valid: true,
                    message: 'Ledger is empty',
                    total_entries: 0
                };
            }

            for (let i = 1; i < entries.length; i++) {
                const entry = entries[i];
                const previousEntry = entries[i - 1];
                const data = typeof entry.data === 'string' 
                    ? JSON.parse(entry.data) 
                    : entry.data;

                const isHashValid = this.verifyHash(
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
        } catch (err) {
            throw err;
        }
    }

    /**
     * Get ledger entries with pagination
     */
    static async getLedgerEntries(limit = 50, offset = 0, farmerId = null) {
        try {
            let query = 'SELECT * FROM ledger';
            let params = [];

            if (farmerId) {
                query += ' WHERE farmer_id = $1';
                params.push(farmerId);
                query += ` ORDER BY id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
                params.push(limit, offset);
            } else {
                query += ` ORDER BY id DESC LIMIT $1 OFFSET $2`;
                params = [limit, offset];
            }

            const result = await pool.query(query, params);
            return result.rows;
        } catch (err) {
            throw err;
        }
    }

    /**
     * Get ledger stats
     */
    static async getLedgerStats() {
        try {
            const result = await pool.query(
                `SELECT 
                    COUNT(*) as total_entries,
                    COUNT(DISTINCT farmer_id) as total_farmers,
                    MAX(created_at) as last_entry
                FROM ledger`
            );
            return result.rows[0];
        } catch (err) {
            throw err;
        }
    }
}

module.exports = LedgerService;
