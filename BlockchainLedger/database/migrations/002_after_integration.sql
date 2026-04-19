-- Add Farmer fields
ALTER TABLE farmers ADD COLUMN district varchar(100);
ALTER TABLE farmers ADD COLUMN state varchar(100);
ALTER TABLE farmers ADD COLUMN email varchar(100);
ALTER TABLE farmers ADD COLUMN password varchar(255);

-- Add Blockchain fields to Ledger for Sepolia anchoring
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS blockchain_tx_hash VARCHAR(66);
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS block_number BIGINT;