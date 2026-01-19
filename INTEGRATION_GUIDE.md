# 🔗 Unified Backend Integration Guide

## Overview
This is a unified backend that integrates:
- **Farmer Authentication System** (MySQL-based)
- **Blockchain Ledger System** (PostgreSQL-based)
- **Price API** for market data
- **Single npm package** for all services

---

## 📦 Project Structure

```
BackEnd/
├── server.js                 # Main entry point
├── package.json              # Unified dependencies
├── .env                       # Configuration (copy from .env.example)
├── config/
│   └── database.js           # MySQL + PostgreSQL connection pools
├── middleware/
│   └── blockchainAuth.js     # Auth + Blockchain linking middleware
├── services/
│   └── ledger.service.js     # Blockchain operations
├── routes/
│   ├── auth.js              # Authentication endpoints
│   ├── blockchain.js        # Blockchain ledger endpoints
│   └── price.js             # Price API endpoints
├── controllers/
│   └── authController.js    # Auth logic
├── PriceAPI/
│   ├── priceapi.js
│   └── priceRoute.js
└── db/
    └── connect.js           # MySQL connection (legacy)
```

---

## 🚀 Setup Instructions

### 1. Install Dependencies
```bash
cd BackEnd
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and update:

```bash
cp .env.example .env
```

Edit `.env`:
```ini
# MySQL (Farmer Auth)
MYSQL_HOST=localhost
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DB=agriculture_db

# PostgreSQL (Blockchain)
POSTGRES_HOST=localhost
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password
POSTGRES_DB=agriculture_ledger

# Session
SESSION_SECRET=your-secret-key
```

### 3. Setup Databases

#### MySQL (Farmer Database)
```sql
CREATE DATABASE agriculture_db;
USE agriculture_db;
-- Run your existing farmer schema
```

#### PostgreSQL (Blockchain Ledger)
```bash
psql -U postgres -d agriculture_ledger < BlockchainLedger/database/001_integrated_schema.sql
```

Or manually run the schema queries in `BlockchainLedger/database/001_integrated_schema.sql`

### 4. Run the Server

**Development (with auto-reload):**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

Server will start on http://localhost:5000

---

## 🔌 API Endpoints

### Authentication (MySQL)

#### Register
```http
POST /api/auth/register
Content-Type: application/json

{
  "name": "John Farmer",
  "email": "john@example.com",
  "password": "secure_password"
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "secure_password"
}
```

#### Profile
```http
GET /api/auth/profile
```

---

### Blockchain Ledger (PostgreSQL)

**All blockchain endpoints require authentication**

#### Create Transaction
```http
POST /api/blockchain/transactions
Content-Type: application/json
Cookie: connect.sid=...

{
  "produceType": "tomato",
  "quantity": 100,
  "grade": "A",
  "pricePerUnit": 50,
  "totalPrice": 5000,
  "buyerId": "buyer123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Transaction recorded in blockchain ledger",
  "transaction": {
    "id": 1,
    "farmer_id": 1,
    "hash": "abc123...",
    "timestamp": "2026-01-18T10:30:00Z",
    "previous_hash": null,
    "data": {...},
    "created_at": "2026-01-18T10:30:00Z"
  },
  "blockchainHash": "abc123..."
}
```

#### Get Farmer's Ledger
```http
GET /api/blockchain/ledger?limit=50&offset=0
Cookie: connect.sid=...
```

#### Verify Blockchain Integrity
```http
GET /api/blockchain/verify
```

**Response:**
```json
{
  "success": true,
  "verification": {
    "valid": true,
    "message": "All entries verified successfully",
    "total_entries": 42
  }
}
```

#### Get Blockchain Statistics
```http
GET /api/blockchain/stats
```

**Response:**
```json
{
  "success": true,
  "stats": {
    "total_entries": 42,
    "total_farmers": 5,
    "last_entry": "2026-01-18T10:30:00Z"
  }
}
```

---

## 🔐 How It Works

### Authentication Flow
1. Farmer registers/logs in via MySQL
2. Session created with farmer details
3. Session stored in express-session

### Blockchain Integration Flow
1. Farmer makes authenticated request
2. `authenticateAndLinkBlockchain` middleware verifies session
3. Middleware creates/links farmer record in PostgreSQL
4. `recordBlockchainTransaction` middleware creates immutable ledger entry
5. Operation recorded with SHA-256 hash
6. Response includes blockchain hash for verification

### Immutability & Verification
- Each ledger entry contains SHA-256 hash of:
  - Previous entry hash (chain linking)
  - Current transaction data
  - Timestamp
- Any tampering breaks the chain
- `GET /api/blockchain/verify` validates entire chain

---

## 🛠️ Middleware Architecture

### `blockchainAuth.js`

#### `authenticateAndLinkBlockchain`
- Verifies farmer session
- Creates/links farmer record in PostgreSQL
- Attaches farmer info to request

#### `recordBlockchainTransaction`
- Creates transaction record
- Generates blockchain hash
- Stores IP and action details

---

## 📊 Database Schema

### MySQL: `farmers` Table
```sql
id, email, name, password, created_at, updated_at
```

### PostgreSQL: `ledger` Table
```sql
id (PK)
farmer_id (FK -> farmers.id)
data (JSONB) - transaction details
timestamp - ISO timestamp
previous_hash (64-char SHA-256)
hash (64-char SHA-256) - UNIQUE
created_at
```

### PostgreSQL: `transactions` Table
```sql
id (PK)
farmer_id (FK)
action - HTTP method + endpoint
details (JSONB)
ip_address
status
hash
timestamp
```

---

## 🔄 Migration from Old System

### Step 1: Update Code
```bash
cd BackEnd
npm install
```

### Step 2: Update Configuration
```bash
cp .env.example .env
# Edit .env with your database credentials
```

### Step 3: Setup PostgreSQL
```bash
psql -U postgres
CREATE DATABASE agriculture_ledger;
\c agriculture_ledger
\i path/to/001_integrated_schema.sql
```

### Step 4: Test
```bash
npm run dev
curl http://localhost:5000/health
```

---

## 📝 Example: Complete Flow

### Step 1: Register Farmer
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Ram Kumar",
    "email": "ram@farm.com",
    "password": "secure123"
  }'
```

### Step 2: Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "email": "ram@farm.com",
    "password": "secure123"
  }'
```

### Step 3: Create Transaction (Blockchain)
```bash
curl -X POST http://localhost:5000/api/blockchain/transactions \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "produceType": "tomato",
    "quantity": 500,
    "grade": "A",
    "pricePerUnit": 40,
    "totalPrice": 20000
  }'
```

### Step 4: View Ledger
```bash
curl http://localhost:5000/api/blockchain/ledger \
  -b cookies.txt
```

### Step 5: Verify Chain
```bash
curl http://localhost:5000/api/blockchain/verify
```

---

## 🐛 Troubleshooting

### MySQL Connection Error
```
Error: connect ECONNREFUSED 127.0.0.1:3306
```
**Fix:** Ensure MySQL is running and credentials in `.env` are correct

### PostgreSQL Connection Error
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```
**Fix:** Ensure PostgreSQL is running and database is created

### Session Not Working
- Clear cookies
- Ensure `SESSION_SECRET` is set in `.env`
- Check if session middleware is loaded

### Hash Mismatch on Verify
- Indicates tampering with ledger data
- Do NOT use tampered data in production
- Implement backup procedures

---

## 📈 Performance Tips

1. **Index Queries:** Add indexes on frequently queried fields
2. **Connection Pooling:** Already configured with 10 connections
3. **Pagination:** Use `limit` and `offset` for large datasets
4. **Caching:** Implement Redis for frequently accessed data

---

## 🔒 Security Considerations

1. **Session Secret:** Change `SESSION_SECRET` in production
2. **HTTPS:** Always use HTTPS in production
3. **CORS:** Configure CORS for your frontend domain
4. **SQL Injection:** Using parameterized queries ✅
5. **Password Hashing:** Using bcrypt ✅
6. **Blockchain Immutability:** SHA-256 hashing prevents tampering ✅

---

## 📞 Support

For issues or questions:
1. Check the `.env` configuration
2. Verify database connections
3. Check server logs
4. Ensure both MySQL and PostgreSQL are running

---

**Version:** 2.0.0  
**Last Updated:** January 2026
