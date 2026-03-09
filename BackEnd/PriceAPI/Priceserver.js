import express    from "express";
import cors        from "cors";
import bodyParser  from "body-parser";
import { AgmarknetPriceFetcher } from "./priceapi.js";

const app  = express();
const PORT = 3001;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
    res.json({
        service: "Agmarknet Smart Price API",
        status:  "running",
        season:  "May 2025 – October 2025",
        method:  "Weighted average with outlier removal (IQR)",
        grades:  { A: "max_price (premium)", B: "modal_price (average)", C: "min_price (lower)" },
        usage: {
            POST: "POST /price  →  body: { state, district, commodity, grade }",
            GET:  "GET  /price  →  query: ?state=Maharashtra&district=Solapur&commodity=Tomato&grade=A"
        }
    });
});

// ── Shared handler ────────────────────────────────────────────────────────────
async function handlePrice(params, res) {
    const { state, district, commodity, grade } = params;

    if (!state || !district || !commodity || !grade) {
        return res.status(400).json({
            success: false,
            message: "Missing parameters: state, district, commodity, grade"
        });
    }

    try {
        const fetcher = new AgmarknetPriceFetcher();
        const result  = await fetcher.getPrice(state, district, commodity, grade);

        if (!result.success || !result.data) {
            return res.status(result.error === "No data found" ? 404 : 500).json({
                success: false,
                message: result.message || "No price data found"
            });
        }

        const data  = result.data;
        const price = Number(data.selectedPrice) || 0;

        return res.json({
            success:          true,
            grade:            data.inputGrade,
            // ✅ Smart estimated price
            price,
            price_type:       data.selectedPriceType,
            price_display:    `₹${price.toLocaleString('en-IN')} per quintal`,
            // All 3 prices
            min_price:        Number(data.minPrice)   || 0,
            modal_price:      Number(data.modalPrice) || 0,
            max_price:        Number(data.maxPrice)   || 0,
            // Simple averages for comparison
            simple_avg_min:   Number(data.simpleAvgMin)   || 0,
            simple_avg_modal: Number(data.simpleAvgModal) || 0,
            simple_avg_max:   Number(data.simpleAvgMax)   || 0,
            // Details
            commodity:        data.commodity || commodity,
            market:           data.market    || '',
            district:         data.district  || district,
            state:            data.state     || state,
            records_used:     data.recordsUsed    || 0,
            total_fetched:    data.totalFetched   || 0,
            season:           data.season         || '',
            used_season_data: data.usedSeasonData ?? false,
            message:          result.message,
            timestamp:        new Date().toISOString()
        });

    } catch (err) {
        console.error("Price server error:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
}

app.post("/price", (req, res) => handlePrice(req.body  || {}, res));
app.get("/price",  (req, res) => handlePrice(req.query || {}, res));

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`✅ Smart Price API running on http://localhost:${PORT}`);
    console.log(`   Season: May 2025 – October 2025`);
    console.log(`   POST http://localhost:${PORT}/price`);
    console.log(`   GET  http://localhost:${PORT}/price?state=Maharashtra&district=Solapur&commodity=Tomato&grade=A`);
});