/**
 * Price Guesser Service
 * Uses CEDA Agmarknet API to fetch last 7 days of prices
 * and returns the mean price based on grade (A=max, B=modal, C=min)
 *
 * POST http://localhost:3002/guess-price
 * Body: { commodity_id, state_id, district_id, market_id, grade }
 *
 * GET  http://localhost:3002/guess-price
 * Query: ?commodity_id=1&state_id=8&district_id=194&market_id=255&grade=A
 */

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const PORT = 3002;
const CEDA_API_URL = "https://api.ceda.ashoka.edu.in/v1/agmarknet/prices";
const CEDA_API_TOKEN = "4face3859fdd510cb9b259c09cc8309f37bb574b57539ca6f36887742f890a84";  

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Returns "YYYY-MM-DD" string for a date offset by `daysAgo` from today */
function dateOffset(daysAgo = 0) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().split("T")[0];
}

/**
 * Fetch price records from CEDA for a date range.
 * commodity_id, state_id  → numbers
 * district_id, market_id  → arrays of numbers (API schema)
 */
async function fetchCedaPrices({ commodity_id, state_id, district_id, market_id, from_date, to_date, token }) {
    const body = {
        commodity_id: Number(commodity_id),
        state_id: Number(state_id),
        district_id: Array.isArray(district_id) ? district_id.map(Number) : [Number(district_id)],
        market_id: Array.isArray(market_id) ? market_id.map(Number) : [Number(market_id)],
        from_date,
        to_date
    };

    const headers = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    };

    console.log(`📡 Fetching CEDA prices from ${from_date} to ${to_date}...`);
    const response = await fetch(CEDA_API_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`CEDA API error ${response.status}: ${text}`);
    }

    const json = await response.json();
    return json.data || [];  // array of { date, min_price, max_price, modal_price, ... }
}

/**
 * Given an array of daily records, compute mean of min/max/modal prices.
 * Returns { mean_min, mean_max, mean_modal, record_count, dates_covered }
 */
function computeMeans(records) {
    if (!records || records.length === 0) return null;

    let sumMin = 0, sumMax = 0, sumModal = 0, count = 0;
    const dates = [];

    for (const r of records) {
        const mn = Number(r.min_price);
        const mx = Number(r.max_price);
        const mo = Number(r.modal_price);

        // Skip records with all-zero prices (missing data)
        if (mn === 0 && mx === 0 && mo === 0) continue;

        sumMin   += mn;
        sumMax   += mx;
        sumModal += mo;
        count++;
        if (r.date) dates.push(r.date);
    }

    if (count === 0) return null;

    return {
        mean_min:   Math.round(sumMin   / count),
        mean_max:   Math.round(sumMax   / count),
        mean_modal: Math.round(sumModal / count),
        record_count: count,
        dates_covered: dates.sort()
    };
}

/**
 * Pick the guessed price based on grade:
 *   A → mean_max   (premium quality)
 *   B → mean_modal (average quality)
 *   C → mean_min   (lower quality)
 */
function selectByGrade(means, grade) {
    const g = grade.toString().toUpperCase();
    const map = {
        A: { price: means.mean_max,   type: "mean_max_price"   },
        B: { price: means.mean_modal, type: "mean_modal_price" },
        C: { price: means.mean_min,   type: "mean_min_price"   }
    };
    return map[g] || map["B"];
}

// ── Core logic ─────────────────────────────────────────────────────────────────

async function guessPrice({ commodity_id, state_id, district_id, market_id, grade, token, days = 7 }) {
    // Validate required params
    if (!commodity_id || !state_id || !district_id || !market_id || !grade) {
        return { success: false, error: "Missing parameters", message: "Provide commodity_id, state_id, district_id, market_id, grade" };
    }

    const validGrades = ["A", "B", "C"];
    if (!validGrades.includes(grade.toString().toUpperCase())) {
        return { success: false, error: "Invalid grade", message: "Grade must be A, B, or C" };
    }

    const to_date   = dateOffset(0);         // today
    const from_date = dateOffset(days - 1);  // 7 days ago

    let records;
    try {
        records = await fetchCedaPrices({ commodity_id, state_id, district_id, market_id, from_date, to_date, token });
    } catch (err) {
        return { success: false, error: "API fetch failed", message: err.message };
    }

    if (!records || records.length === 0) {
        return { success: false, error: "No data", message: `No price records found for the last ${days} days` };
    }

    const means = computeMeans(records);
    if (!means) {
        return { success: false, error: "No valid prices", message: "All records had zero prices — data may be unavailable" };
    }

    const { price, type } = selectByGrade(means, grade);

    return {
        success: true,
        grade: grade.toUpperCase(),
        guessed_price: price,
        price_type_used: type,
        mean_min_price:   means.mean_min,
        mean_max_price:   means.mean_max,
        mean_modal_price: means.mean_modal,
        days_analyzed: days,
        records_used: means.record_count,
        date_range: { from: from_date, to: to_date },
        dates_with_data: means.dates_covered,
        message: `Price guessed from ${means.record_count} day(s) of data over last ${days} days`
    };
}

// ── Routes ─────────────────────────────────────────────────────────────────────

// Health check
app.get("/", (req, res) => {
    res.json({
        service: "Price Guesser API",
        status: "running",
        endpoints: {
            POST: "/guess-price  → body: { commodity_id, state_id, district_id, market_id, grade, token? }",
            GET:  "/guess-price  → query: ?commodity_id=&state_id=&district_id=&market_id=&grade=&token="
        }
    });
});

// POST /guess-price
app.post("/guess-price", async (req, res) => {
    try {
        const { commodity_id, state_id, district_id, market_id, grade, token, days } = req.body || {};
        const result = await guessPrice({ commodity_id, state_id, district_id, market_id, grade, token: token || CEDA_API_TOKEN, days });

        if (!result.success) {
            return res.status(result.error === "Missing parameters" || result.error === "Invalid grade" ? 400 : 500).json(result);
        }

        return res.json(result);
    } catch (err) {
        console.error("POST /guess-price error:", err);
        return res.status(500).json({ success: false, error: "Server error", message: err.message });
    }
});

// GET /guess-price
app.get("/guess-price", async (req, res) => {
    try {
        const { commodity_id, state_id, district_id, market_id, grade, token, days } = req.query || {};

        // district_id and market_id can be comma-separated in query string: ?market_id=255,3149
        const parsedDistrict = district_id?.includes(",") ? district_id.split(",") : district_id;
        const parsedMarket   = market_id?.includes(",")   ? market_id.split(",")   : market_id;

        const result = await guessPrice({ commodity_id, state_id, district_id, market_id, grade, token, days });

        if (!result.success) {
            return res.status(result.error === "Missing parameters" || result.error === "Invalid grade" ? 400 : 500).json(result);
        }

        return res.json(result);
    } catch (err) {
        console.error("GET /guess-price error:", err);
        return res.status(500).json({ success: false, error: "Server error", message: err.message });
    }
});

// ── Start ──────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
    console.log(`✅ Price Guesser API running on http://localhost:${PORT}`);
    console.log(`   POST /guess-price  →  { commodity_id, state_id, district_id, market_id, grade }`);
    console.log(`   GET  /guess-price  →  ?commodity_id=1&state_id=8&district_id=194&market_id=255&grade=A`);
});

export default app;