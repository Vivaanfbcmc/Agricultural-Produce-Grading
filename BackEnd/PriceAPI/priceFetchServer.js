/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║         CEDA Smart Price Guesser — Single File           ║
 * ║                  Runs on port 3002                       ║
 * ╠══════════════════════════════════════════════════════════╣
 * ║  FLOW:                                                   ║
 * ║  1. ML Model (port 5001) detects grade → A / B / C      ║
 * ║  2. Frontend POSTs grade + commodity_id to /price        ║
 * ║  3. This server fetches May–Oct 2025 data from CEDA      ║
 * ║  4. Smart price calc (IQR + weighted avg) on that grade  ║
 * ║  5. Returns price to frontend                            ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 *  Grade logic:
 *    A (premium)  → smart price from max_price   column
 *    B (standard) → smart price from modal_price column
 *    C (lower)    → smart price from min_price   column
 *    rotten       → price = 0, rejected
 */

import express   from "express";
import cors      from "cors";
import bodyParser from "body-parser";

// ══════════════════════════════════════════════════════════
//  ✏️  CONFIG — fill these in
// ══════════════════════════════════════════════════════════
const CEDA_TOKEN      = "4face3859fdd510cb9b259c09cc8309f37bb574b57539ca6f36887742f890a84";          // 👈 paste your Bearer token here
const CEDA_API_URL    = "https://api.ceda.ashoka.edu.in/v1/agmarknet/prices";

// Hardcoded location (Maharashtra / Solapur / market)
const STATE_ID        = 27;
const DISTRICT_ID     = [526];
const MARKET_ID       = [176];

// Season window
const SEASON_FROM     = "2025-05-01";
const SEASON_TO       = "2025-10-31";

const PORT            = 3002;

// debug logger — every log prefixed [CW]
const cw = (...a) => console.log("[CW]", ...a);

// ══════════════════════════════════════════════════════════
//  STEP 1 — Call CEDA API
//  POST https://api.ceda.ashoka.edu.in/v1/agmarknet/prices
//  Bearer token in Authorization header
//  Returns: { data: [ { date, min_price, max_price, modal_price, ... } ] }
// ══════════════════════════════════════════════════════════
async function fetchCedaRecords(commodity_id) {
    const body = {
        commodity_id: Number(commodity_id),
        state_id:     STATE_ID,
        district_id:  DISTRICT_ID,
        market_id:    MARKET_ID,
        from_date:    SEASON_FROM,
        to_date:      SEASON_TO
    };

    cw("── CEDA REQUEST ──────────────────────────────");
    cw("URL  →", CEDA_API_URL);
    cw("Body →", JSON.stringify(body));

    const res = await fetch(CEDA_API_URL, {
        method:  "POST",
        headers: {
            "Content-Type":  "application/json",
            "Authorization": `Bearer ${CEDA_TOKEN}`
        },
        body: JSON.stringify(body)
    });

    cw("CEDA HTTP status →", res.status);

    if (res.status === 401) throw new Error("Unauthorized — check CEDA Bearer token");
    if (res.status === 429) throw new Error("Rate limit hit — wait and retry");
    if (!res.ok)            throw new Error(`CEDA API failed: HTTP ${res.status}`);

    const json = await res.json();
    cw("CEDA response keys →", Object.keys(json));

    // CEDA response: { data: [...] }  or  { output: { data: [...] } }
    const records = json?.data || json?.output?.data || [];
    cw(`Records returned → ${records.length}`);
    if (records.length > 0) cw("Sample record →", JSON.stringify(records[0]));

    return records;
}

// ══════════════════════════════════════════════════════════
//  STEP 2 — Smart Price Calculation
//
//  Given an array of daily price records and a grade:
//
//  a) Parse min/max/modal from each record
//  b) Drop records where all prices are 0
//  c) IQR Outlier Removal on the target price column:
//       - Sort values, find Q1 (25th %) and Q3 (75th %)
//       - IQR = Q3 - Q1
//       - Drop any record outside [Q1-1.5*IQR, Q3+1.5*IQR]
//       - This removes freak spike/crash days automatically
//  d) Sort remaining records oldest → newest
//  e) Recency-Weighted Average:
//       - weight = index + 1  (Oct data weighs more than May)
//       - weighted_price = Σ(price × weight) / Σ(weight)
//  f) Return the weighted avg for the grade's price column
// ══════════════════════════════════════════════════════════
function computeSmartPrice(records, grade) {
    const g = grade.toUpperCase();

    // Pick which price column to focus on for this grade
    const priceKey =
        g === "A" ? "max"   :
            g === "B" ? "modal" :
                "min";

    cw(`── SMART PRICE CALC (grade=${g}, column=${priceKey}_price) ──`);

    // Parse all records
    const parsed = records.map(r => ({
        date:  r.date || "",
        min:   Number(r.min_price)   || 0,
        max:   Number(r.max_price)   || 0,
        modal: Number(r.modal_price) || 0,
    })).filter(r => r.min > 0 || r.max > 0 || r.modal > 0);

    cw(`Valid records after parsing → ${parsed.length}`);
    if (parsed.length === 0) return null;

    // Sort oldest → newest
    parsed.sort((a, b) => new Date(a.date) - new Date(b.date));
    cw(`Date range → ${parsed[0].date}  to  ${parsed[parsed.length - 1].date}`);

    // IQR on the target price column
    const values = parsed.map(r => r[priceKey]).filter(v => v > 0).sort((a, b) => a - b);
    const q1     = values[Math.floor(values.length * 0.25)] || 0;
    const q3     = values[Math.floor(values.length * 0.75)] || Infinity;
    const iqr    = q3 - q1;
    const lower  = q1 - 1.5 * iqr;
    const upper  = q3 + 1.5 * iqr;

    const clean = parsed.filter(r => {
        const v = r[priceKey];
        return v === 0 || (v >= lower && v <= upper);
    });

    cw(`IQR bounds → [${Math.round(lower)}, ${Math.round(upper)}]`);
    cw(`Outliers removed → ${parsed.length - clean.length} | clean records = ${clean.length}`);

    if (clean.length === 0) return null;

    // Recency-weighted average on the target column
    let wSum = 0, wTotal = 0;
    clean.forEach((r, i) => {
        const w  = i + 1;           // recent = higher weight
        wSum    += r[priceKey] * w;
        wTotal  += w;
    });

    const smartPrice = Math.round(wSum / wTotal);
    cw(`✅ Smart price (${priceKey}) → ₹${smartPrice}`);

    // Also compute all 3 weighted avgs for reference
    let wMin = 0, wMax = 0, wModal = 0, wT2 = 0;
    clean.forEach((r, i) => {
        const w  = i + 1;
        wMin    += r.min   * w;
        wMax    += r.max   * w;
        wModal  += r.modal * w;
        wT2     += w;
    });

    return {
        smartPrice,
        priceColumn:    `${priceKey}_price`,
        weightedMin:    Math.round(wMin   / wT2),
        weightedMax:    Math.round(wMax   / wT2),
        weightedModal:  Math.round(wModal / wT2),
        recordsUsed:    clean.length,
        totalFetched:   parsed.length,
        outliersRemoved: parsed.length - clean.length
    };
}

// ══════════════════════════════════════════════════════════
//  EXPRESS SERVER
// ══════════════════════════════════════════════════════════
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Health check
app.get("/", (req, res) => res.json({
    service:    "CEDA Smart Price Guesser",
    status:     "running",
    token_set:  CEDA_TOKEN ? "✓ YES" : "✗ NO — fill CEDA_TOKEN",
    season:     `${SEASON_FROM} to ${SEASON_TO}`,
    location:   { state_id: STATE_ID, district_id: DISTRICT_ID, market_id: MARKET_ID },
    grades:     { A: "max_price (premium)", B: "modal_price (standard)", C: "min_price (lower)", rotten: "rejected ₹0" },
    endpoints:  {
        POST: `POST http://localhost:${PORT}/price`,
        body: { commodity_id: 23, grade: "A" },
        note: "grade comes from ML model (/analyze on port 5001)"
    }
}));

// ── Main /price endpoint ──────────────────────────────────
app.post("/price", async (req, res) => {
    cw("══════════════════════════════════════════════");
    cw("POST /price →", req.body);

    const { commodity_id, grade } = req.body || {};

    // Validate
    if (!commodity_id || !grade) {
        cw("❌ Missing params");
        return res.status(400).json({
            success: false,
            message: `Missing: ${!commodity_id ? "commodity_id " : ""}${!grade ? "grade" : ""}`.trim()
        });
    }

    // Rotten → reject immediately, no price needed
    if (grade.toLowerCase() === "rotten") {
        cw("🔴 Grade = rotten → rejected");
        return res.json({
            success:       true,
            grade:         "rotten",
            price:         0,
            price_display: "₹0 — Rejected (rotten)",
            message:       "Tomato is rotten and cannot be sold"
        });
    }

    if (!["A","B","C"].includes(grade.toUpperCase())) {
        return res.status(400).json({ success: false, message: "Grade must be A, B, C, or rotten" });
    }
    if (!CEDA_TOKEN) {
        return res.status(500).json({ success: false, message: "CEDA_TOKEN not set in priceGuesser.js" });
    }

    try {
        // Step 1: Fetch from CEDA
        const records = await fetchCedaRecords(commodity_id);

        if (!records || records.length === 0) {
            cw("❌ No records from CEDA");
            return res.status(404).json({
                success: false,
                message: `No data found for commodity_id=${commodity_id} in season ${SEASON_FROM}→${SEASON_TO}`
            });
        }

        // Step 2: Smart price
        const result = computeSmartPrice(records, grade);

        if (!result) {
            cw("❌ Smart price computation failed");
            return res.status(500).json({
                success: false,
                message: "Price computation failed — all price values were zero"
            });
        }

        const price = result.smartPrice;
        cw(`✅ FINAL PRICE → Grade ${grade.toUpperCase()} = ₹${price} per quintal`);
        cw("══════════════════════════════════════════════");

        return res.json({
            success:          true,
            grade:            grade.toUpperCase(),

            // ✅ THE PRICE (use this in frontend)
            price,
            price_display:    `₹${price.toLocaleString("en-IN")} per quintal`,
            price_column:     result.priceColumn,

            // All 3 weighted prices for reference
            min_price:        result.weightedMin,
            modal_price:      result.weightedModal,
            max_price:        result.weightedMax,

            // Stats
            records_used:     result.recordsUsed,
            total_fetched:    result.totalFetched,
            outliers_removed: result.outliersRemoved,
            season:           `${SEASON_FROM} to ${SEASON_TO}`,
            location: {
                state_id:    STATE_ID,
                district_id: DISTRICT_ID,
                market_id:   MARKET_ID
            },
            timestamp:        new Date().toISOString(),
            message:          `Smart price for Grade ${grade.toUpperCase()} estimated from ${result.recordsUsed} records`
        });

    } catch (err) {
        cw("💥 ERROR →", err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
});

// GET version (for quick browser/postman testing)
app.get("/price", async (req, res) => {
    req.body = req.query;
    app._router.handle({ ...req, method: "POST", url: "/price", body: req.query }, res, () => {});
});

// ── Start ─────────────────────────────────────────────────
app.listen(PORT, () => {
    cw("══════════════════════════════════════════════");
    cw(`✅  CEDA Smart Price Guesser — http://localhost:${PORT}`);
    cw(`    Season   : ${SEASON_FROM} → ${SEASON_TO}`);
    cw(`    Location : state=${STATE_ID} district=${DISTRICT_ID} market=${MARKET_ID}`);
    cw(`    Token    : ${CEDA_TOKEN ? "SET ✓" : "NOT SET ✗ — open file and fill CEDA_TOKEN"}`);
    cw(`    ML Model : http://localhost:5001/analyze  (POST image)`);
    cw(`    Price    : http://localhost:${PORT}/price  (POST { commodity_id, grade })`);
    cw("══════════════════════════════════════════════");
});