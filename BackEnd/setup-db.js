#!/usr/bin/env node
/**
 * Database Setup Script
 * Creates the agriculture_db database and all tables
 */

const { Client } = require('pg');

async function setupDatabase() {
    const adminClient = new Client({
        user: 'postgres',
        password: 'admin619',
        host: 'localhost',
        port: 5432,
        database: 'postgres' // Connect to default postgres DB first
    });

    try {
        await adminClient.connect();
        console.log('✅ Connected to PostgreSQL');

        // Create database if it doesn't exist
        try {
            await adminClient.query('CREATE DATABASE agriculture_db;');
            console.log('✅ Created database: agriculture_db');
        } catch (err) {
            if (err.code === '42P04') { // Database already exists
                console.log('⚠️  Database agriculture_db already exists');
            } else {
                throw err;
            }
        }

        await adminClient.end();

        // Now connect to the new database and create schema
        const appClient = new Client({
            user: 'postgres',
            password: 'admin619',
            host: 'localhost',
            port: 5432,
            database: 'agriculture_db'
        });

        await appClient.connect();
        console.log('✅ Connected to agriculture_db');

        // Create tables
        const schema = `
        -- Farmers table (Authentication)
        CREATE TABLE IF NOT EXISTS farmers (
            id SERIAL PRIMARY KEY,
            fname VARCHAR(100) NOT NULL,
            lname VARCHAR(100) NOT NULL,
            phone VARCHAR(20) UNIQUE NOT NULL,
            email VARCHAR(255) UNIQUE,
            hashedPassword VARCHAR(255) NOT NULL,
            state VARCHAR(100),
            district VARCHAR(100),
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            is_active BOOLEAN DEFAULT TRUE
        );

        CREATE INDEX IF NOT EXISTS idx_farmers_phone ON farmers(phone);
        CREATE INDEX IF NOT EXISTS idx_farmers_email ON farmers(email);

        -- Ledger table (Blockchain - Immutable)
        CREATE TABLE IF NOT EXISTS ledger (
            id SERIAL PRIMARY KEY,
            farmer_id INTEGER NOT NULL REFERENCES farmers(id),
            data JSONB NOT NULL,
            timestamp TIMESTAMP NOT NULL,
            previous_hash VARCHAR(64),
            hash VARCHAR(64) UNIQUE NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_ledger_farmer_id ON ledger(farmer_id);
        CREATE INDEX IF NOT EXISTS idx_ledger_timestamp ON ledger(timestamp);
        CREATE INDEX IF NOT EXISTS idx_ledger_hash ON ledger(hash);

        -- Transactions table (Audit Log)
        CREATE TABLE IF NOT EXISTS transactions (
            id SERIAL PRIMARY KEY,
            farmer_id INTEGER NOT NULL REFERENCES farmers(id),
            action VARCHAR(255) NOT NULL,
            details JSONB,
            ip_address VARCHAR(45),
            timestamp TIMESTAMP DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_transactions_farmer_id ON transactions(farmer_id);
        CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp);

        -- Verification log table
        CREATE TABLE IF NOT EXISTS verification_log (
            id SERIAL PRIMARY KEY,
            ledger_id INTEGER REFERENCES ledger(id),
            verified_at TIMESTAMP DEFAULT NOW(),
            is_valid BOOLEAN NOT NULL,
            verification_details JSONB
        );

        CREATE INDEX IF NOT EXISTS idx_verification_log_ledger_id ON verification_log(ledger_id);
        `;

        await appClient.query(schema);
        console.log('✅ Created all database tables');

        await appClient.end();
        console.log('\n✅ Database setup complete!');
        process.exit(0);

    } catch (err) {
        console.error('❌ Database setup error:', err.message);
        process.exit(1);
    }
}

setupDatabase();
