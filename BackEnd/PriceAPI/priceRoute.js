import express from "express";
import { getVegetablePrice } from "./priceapi.js";

const router = express.Router();

function buildResponse(result, grade, commodity, district, state) {
    const data  = result.data || {};
    const g     = grade.toString().toUpperCase();
    const price = Number(data.selectedPrice) || 0;

    return {
        success:          true,
        grade:            g,
        // ✅ The smart estimated price
        price,
        price_type:       data.selectedPriceType || '',
        price_display:    `₹${price.toLocaleString('en-IN')} per quintal`,
        // All 3 smart prices
        min_price:        Number(data.minPrice)   || 0,
        modal_price:      Number(data.modalPrice) || 0,
        max_price:        Number(data.maxPrice)   || 0,
        // Simple averages for reference
        simple_avg_min:   Number(data.simpleAvgMin)   || 0,
        simple_avg_modal: Number(data.simpleAvgModal) || 0,
        simple_avg_max:   Number(data.simpleAvgMax)   || 0,
        // Meta
        commodity:        data.commodity   || commodity,
        market:           data.market      || '',
        district:         data.district    || district,
        state:            data.state       || state,
        records_used:     data.recordsUsed || 0,
        season:           data.season      || '',
        used_season_data: data.usedSeasonData ?? false,
        timestamp:        data.timestamp   || new Date().toISOString()
    };
}

async function handlePriceRequest(params, res) {
    const { state, district, commodity, grade } = params;

    if (!state || !district || !commodity || !grade) {
        return res.status(400).json({
            success: false,
            error:   "Missing parameters",
            message: "Provide state, district, commodity and grade"
        });
    }

    const result = await getVegetablePrice({ state, district, commodity, grade });

    if (!result || !result.success) {
        return res.status(result?.error === "No data found" ? 404 : 500).json({
            success: false,
            error:   result?.error   || "Price fetch failed",
            message: result?.message || "Unable to fetch price"
        });
    }

    return res.json(buildResponse(result, grade, commodity, district, state));
}

router.post("/", async (req, res) => {
    try { await handlePriceRequest(req.body  || {}, res); }
    catch (err) {
        console.error("Price POST route error:", err);
        res.status(500).json({ success: false, error: "Server error", message: err.message });
    }
});

router.get("/", async (req, res) => {
    try { await handlePriceRequest(req.query || {}, res); }
    catch (err) {
        console.error("Price GET route error:", err);
        res.status(500).json({ success: false, error: "Server error", message: err.message });
    }
});

export default router;