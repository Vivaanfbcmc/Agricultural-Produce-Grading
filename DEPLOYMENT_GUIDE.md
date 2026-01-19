# 🚀 Deployment & Architecture Guide

## Single NPM Package Architecture

### Before (Two Separate Systems)
```
BackEnd/
├── server.js
├── package.json (with 8 dependencies)
├── routes/auth.js
└── ... (MySQL only)

BlockchainLedger/backend/
├── app.js
├── package.json (with 4 dependencies)
├── routes/api.routes.js
└── ... (PostgreSQL only)

❌ Problem: Two separate processes, dependencies, configurations
```

### After (Unified System)
```
BackEnd/
├── server.js (unified entry point)
├── package.json (12 unified dependencies)
├── config/database.js (MySQL + PostgreSQL)
├── middleware/blockchainAuth.js
├── services/ledger.service.js
├── routes/auth.js (authentication)
├── routes/blockchain.js (blockchain + auth)
└── ...

✅ Solution: Single process, single npm install, unified configuration
```

---

## Dependencies Unified

```json
{
  "dependencies": {
    "express": "^5.2.1",              // Web framework
    "cors": "^2.8.5",                 // Cross-origin requests
    "dotenv": "^17.2.3",              // Environment config
    
    // MySQL (Farmer Auth)
    "mysql2": "^3.15.3",              // MySQL driver
    "express-mysql-session": "^3.0.3", // MySQL session store
    "bcrypt": "^6.0.0",               // Password hashing
    "cookie-parser": "^1.4.7",        // Cookie parsing
    "jsonwebtoken": "^9.0.3",         // JWT tokens
    
    // PostgreSQL (Blockchain)
    "pg": "^8.11.3",                  // PostgreSQL driver
    
    // Session
    "express-session": "^1.18.2",     // Session management
    
    // Utilities
    "node-fetch": "^3.3.2"            // HTTP requests
  },
  "devDependencies": {
    "nodemon": "^3.0.1"               // Auto-reload in dev
  }
}
```

---

## Running the Unified System

### Local Development
```bash
cd BackEnd
npm install
npm run dev
```

### Production
```bash
npm start
```

### Single Port
✅ Everything runs on port 5000
- `/api/auth/*` - Authentication
- `/api/blockchain/*` - Blockchain ledger
- `/api/price/*` - Price API
- `/health` - Health check

---

## File Structure for Production

```
BackEnd/
├── server.js                    # Start here: npm start
├── package.json                 # All dependencies
├── .env                         # Configuration (NOT in git)
│
├── config/
│   └── database.js              # Connection pools
│
├── middleware/
│   └── blockchainAuth.js        # Auth + blockchain link
│
├── services/
│   └── ledger.service.js        # Blockchain operations
│
├── routes/
│   ├── auth.js                  # /api/auth/*
│   ├── blockchain.js            # /api/blockchain/*
│   └── price.js                 # /api/price/*
│
├── controllers/
│   └── authController.js        # Auth logic
│
├── PriceAPI/
│   ├── priceapi.js
│   └── priceRoute.js
│
└── db/ (legacy, can be removed)
    └── connect.js
```

---

## Database Setup

### PostgreSQL Ledger (One-time setup)

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE agriculture_ledger;

# Run schema
\c agriculture_ledger
\i '/path/to/BlockchainLedger/database/001_integrated_schema.sql'

# Verify tables
\dt  # List tables
```

### MySQL Authentication (Existing)

Your existing MySQL database continues to work without changes.

---

## Configuration

### `.env` File (Production)
```ini
# Only one configuration file needed
PORT=5000
NODE_ENV=production

# Session
SESSION_SECRET=use-a-strong-random-string

# MySQL
MYSQL_HOST=mysql.example.com
MYSQL_USER=farm_user
MYSQL_PASSWORD=secure_password
MYSQL_DB=agriculture_db

# PostgreSQL
POSTGRES_HOST=postgres.example.com
POSTGRES_USER=ledger_user
POSTGRES_PASSWORD=secure_password
POSTGRES_DB=agriculture_ledger
```

---

## Docker Deployment (Optional)

### Dockerfile
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY BackEnd/package.json .
RUN npm ci --only=production

COPY BackEnd/ .

EXPOSE 5000

CMD ["npm", "start"]
```

### Docker Compose
```yaml
version: '3.8'

services:
  backend:
    build: .
    ports:
      - "5000:5000"
    environment:
      NODE_ENV: production
      PORT: 5000
      MYSQL_HOST: mysql
      POSTGRES_HOST: postgres
    depends_on:
      - mysql
      - postgres

  mysql:
    image: mysql:8
    environment:
      MYSQL_DATABASE: agriculture_db
      MYSQL_ROOT_PASSWORD: root_password
    volumes:
      - mysql_data:/var/lib/mysql

  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: agriculture_ledger
      POSTGRES_PASSWORD: postgres_password
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  mysql_data:
  postgres_data:
```

### Run with Docker
```bash
docker-compose up -d
```

---

## Load Balancing (Multiple Instances)

If you need to run multiple backend instances:

```yaml
# Docker Compose with multiple backends
services:
  backend1:
    build: .
    ports:
      - "5001:5000"
  backend2:
    build: .
    ports:
      - "5002:5000"
  backend3:
    build: .
    ports:
      - "5003:5000"

  nginx:
    image: nginx:latest
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
```

### nginx.conf
```nginx
upstream backend {
    server backend1:5000;
    server backend2:5000;
    server backend3:5000;
}

server {
    listen 80;
    location / {
        proxy_pass http://backend;
    }
}
```

---

## Monitoring

### Health Check Endpoint
```bash
curl http://localhost:5000/health
```

Response:
```json
{
  "status": "OK",
  "message": "Agricultural Produce Grading System - Unified Backend Running",
  "timestamp": "2026-01-18T10:30:00Z",
  "version": "2.0.0"
}
```

### Process Monitoring (PM2)
```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start BackEnd/server.js --name "agricultural-backend"

# Monitor
pm2 monit

# Logs
pm2 logs agricultural-backend

# Auto-restart on reboot
pm2 startup
pm2 save
```

---

## Performance Optimization

### 1. Connection Pooling (Already Configured)
```javascript
// MySQL: 10 connections
// PostgreSQL: 10 connections
```

### 2. Environment-based Optimizations

**Development (.env)**
```ini
NODE_ENV=development
LOG_LEVEL=debug
```

**Production (.env)**
```ini
NODE_ENV=production
LOG_LEVEL=error
```

### 3. Caching Headers

Add to routes:
```javascript
res.set('Cache-Control', 'public, max-age=300');
```

### 4. Compression

```bash
npm install compression
```

Then in server.js:
```javascript
const compression = require('compression');
app.use(compression());
```

---

## Database Backups

### MySQL Backup
```bash
mysqldump -u root -p agriculture_db > backup_mysql.sql
```

### PostgreSQL Backup
```bash
pg_dump -U postgres agriculture_ledger > backup_postgres.sql
```

### Automated Backup (Cron Job)
```bash
# Run daily at 2 AM
0 2 * * * mysqldump -u root -p$MYSQL_PASS agriculture_db > /backups/mysql_$(date +\%Y\%m\%d).sql
0 2 * * * pg_dump -U postgres agriculture_ledger > /backups/postgres_$(date +\%Y\%m\%d).sql
```

---

## Troubleshooting

### Port Already in Use
```bash
# Find process using port 5000
lsof -i :5000

# Kill process
kill -9 <PID>
```

### Out of Memory
- Reduce connection pool size in config/database.js
- Enable compression
- Implement pagination for large queries

### Slow Queries
- Check database indexes
- Use `EXPLAIN` in PostgreSQL
- Monitor with `EXPLAIN ANALYZE`

---

## Upgrade Path

### From Old System to Unified
1. ✅ Install unified package.json
2. ✅ Setup PostgreSQL database
3. ✅ Update environment variables
4. ✅ Run single server.js
5. ✅ Test endpoints
6. ✅ Remove old blockchain folder (optional)

---

## Summary

| Aspect | Before | After |
|--------|--------|-------|
| **Packages** | 2 (separate) | 1 (unified) |
| **npm install** | Run twice | Run once |
| **Ports** | 5000 + 3000 | 5000 only |
| **Config Files** | 2 .env files | 1 .env file |
| **Databases** | Separated | Connected |
| **Authentication** | MySQL only | MySQL + Blockchain |
| **Deployment** | 2 processes | 1 process |

---

**Version:** 2.0.0  
**Status:** Production Ready ✅
