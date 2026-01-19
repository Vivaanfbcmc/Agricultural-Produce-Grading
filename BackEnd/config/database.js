const { Pool } = require('pg');
require('dotenv').config();

// PostgreSQL Connection Pool (unified for both authentication and blockchain ledger)
const pool = new Pool({
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'admin619',
    host: process.env.POSTGRES_HOST || 'localhost',
    port: process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DB || 'agriculture_db'
});

// Test connection
const testConnections = async () => {
    try {
        // Test PostgreSQL
        const result = await pool.query('SELECT NOW()');
        console.log('✅ PostgreSQL connected');
        return true;
    } catch (err) {
        console.error('❌ Database connection error:', err.message);
        return false;
    }
};

module.exports = {
    pool,
    testConnections
};
