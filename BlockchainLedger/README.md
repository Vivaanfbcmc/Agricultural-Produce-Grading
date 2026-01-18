# 🪟 Agricultural Blockchain Ledger System - Setup Guide

## 📁 Project Structure

This is an **isolated blockchain ledger system** added alongside your existing project. Your original files remain **completely untouched**.

```
BlockchainLedger/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── database.js           # PostgreSQL connection pool
│   │   ├── services/
│   │   │   ├── hash.service.js       # SHA256 hashing for immutability
│   │   │   └── ledger.service.js     # Ledger operations & verification
│   │   ├── controllers/
│   │   │   ├── transaction.controller.js    # Transaction endpoints
│   │   │   └── verification.controller.js   # Verification endpoints
│   │   ├── routes/
│   │   │   └── api.routes.js         # API route definitions
│   │   └── app.js                    # Express server
│   ├── package.json                  # Dependencies
│   └── .env                          # Environment variables (CONFIGURE THIS!)
│
└── database/
    └── migrations/
        └── 001_initial_schema.sql    # PostgreSQL schema setup
```

## ⚙️ Quick Setup (Windows)

### 1. PostgreSQL Database Setup

**Run in Command Prompt (as Administrator):**

```cmd
REM Connect to PostgreSQL
psql -U postgres

REM Create database
CREATE DATABASE agri_ledger;

REM Exit
\q
```

**OR use pgAdmin 4:**
1. Right-click "Databases" → Create → Database
2. Name: `agri_ledger`
3. Click Save

### 2. Create Database Schema

**Option A: Using pgAdmin Query Tool**
- Click on `agri_ledger` database
- Click "Query Tool"
- Open and paste: `database/migrations/001_initial_schema.sql`
- Execute

**Option B: Using Command Prompt**

```cmd
cd BlockchainLedger\database\migrations
psql -U postgres -d agri_ledger -f 001_initial_schema.sql
```

### 3. Configure Environment

**Edit `BlockchainLedger/backend/.env`:**

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=agri_ledger
DB_USER=postgres
DB_PASSWORD=YOUR_ACTUAL_PASSWORD_HERE    # ⚠️ IMPORTANT: Replace this!

PORT=3000
NODE_ENV=development
```

### 4. Install Dependencies

```cmd
cd BlockchainLedger\backend
npm install
```

### 5. Start the Server

```cmd
npm start
```

Expected output:
```
🚀 Server running on http://localhost:3000
🔒 Immutable ledger system active
📊 Database: agri_ledger
```

## 🔗 API Endpoints

### Health Check
```
GET http://localhost:3000/health
```

### Create Transaction
```
POST http://localhost:3000/api/transactions
Content-Type: application/json

{
  "farmer_id": "F001",
  "produce_name": "Tomatoes",
  "quantity": 100,
  "ai_grade": "A+",
  "price": 45.50
}
```

### Get All Transactions
```
GET http://localhost:3000/api/transactions?limit=50&offset=0
```

### Get Farmer Transactions
```
GET http://localhost:3000/api/transactions/farmer/F001
```

### Verify Ledger Integrity
```
GET http://localhost:3000/api/ledger/verify
```

Response:
```json
{
  "valid": true,
  "message": "All entries verified successfully",
  "total_entries": 5
}
```

### View Ledger Entries
```
GET http://localhost:3000/api/ledger?limit=50&offset=0
```

## 🧪 Testing with Postman

1. Download: https://www.postman.com/downloads/
2. Create request:
   - Method: POST
   - URL: `http://localhost:3000/api/transactions`
   - Body → raw → JSON
   - Paste transaction data above
   - Send

## 🔐 Security Features

✅ **Immutable Ledger** - PostgreSQL triggers prevent UPDATE/DELETE
✅ **Hash Chain** - SHA256 hashing ensures data integrity
✅ **Transaction Verification** - Automatic chain validation
✅ **JSONB Storage** - Flexible data structure with validation

## 🛠️ Troubleshooting

| Issue | Solution |
|-------|----------|
| `ECONNREFUSED` - Can't connect DB | Start PostgreSQL service: `net start postgresql-x64-16` |
| `Module not found` | Run: `npm install` |
| `Port 3000 in use` | Change PORT in `.env` to `3001` |
| `Password incorrect` | Verify `.env` password matches PostgreSQL setup |
| `Database does not exist` | Run schema SQL to create `agri_ledger` |

## 📝 Key Design

**Your existing MongoDB/backend remains completely unchanged.**

This system uses **PostgreSQL** for the blockchain ledger because:
- Immutable triggers are built into the database
- JSONB provides flexibility
- ACID compliance ensures data integrity
- Hash verification runs independently

## 🎓 For Demo/Viva

Show your examiner:
1. PostgreSQL running with `agri_ledger` database
2. Genesis block in ledger table (pgAdmin)
3. Server running with blockchain endpoints active
4. Create a transaction via API
5. Query `/api/ledger/verify` - shows success
6. Attempt UPDATE on ledger - shows trigger error (proof of immutability)

**Perfect viva answer**: "The blockchain ledger runs independently with PostgreSQL triggers that prevent any modification, ensuring immutability even with database admin access."

---

**Need help?** Check your `.env` file first - 90% of issues are configuration-related!
