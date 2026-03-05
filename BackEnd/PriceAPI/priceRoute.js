import express from "express";
import { getVegetablePrice } from "./priceapi.js";

const router = express.Router();

async function handlePriceRequest(params, res) {
    const { state, district, commodity, grade } = params;

    if (!state || !district || !commodity || !grade) {
        return res.status(400).json({
            success: false,
            error: "Missing parameters",
            message: "Provide state, district, commodity and grade"
        });
    }

    const result = await getVegetablePrice({ state, district, commodity, grade });

    if (!result || !result.success) {
        return res.status(500).json({
            success: false,
            error: result?.error || "Price fetch failed",
            message: result?.message || "Unable to fetch price"
        });
    }

    const data = result.data || {};
    const g = grade.toString().toUpperCase();

    const min   = Number(data.minPrice)   || 0;
    const modal = Number(data.modalPrice) || 0;
    const max   = Number(data.maxPrice)   || 0;

    const selected =
        g === "A" ? max :
        g === "B" ? modal :
        g === "C" ? min : modal;

    const type =
        g === "A" ? "max_price" :
        g === "B" ? "modal_price" :
        g === "C" ? "min_price" : "modal_price";

    return res.json({
        success:             true,
        grade:               g,
        // ✅ Main price output — this is what you want
        price:               selected,
        price_type:          type,
        price_display:       `₹${selected.toLocaleString('en-IN')} per quintal`,
        // All 3 prices for reference
        min_price:           min,
        modal_price:         modal,
        max_price:           max,
        // Meta info
        commodity:           data.commodity  || commodity,
        market:              data.market     || '',
        district:            data.district   || district,
        state:               data.state      || state,
        arrival_date:        data.arrivalDate || '',
        timestamp:           data.timestamp  || new Date().toISOString()
    });
}

router.post("/", async (req, res) => {
    try {
        await handlePriceRequest(req.body || {}, res);
    } catch (err) {
        console.error("Price POST route error:", err);
        res.status(500).json({ success: false, error: "Server error", message: err.message });
    }
});

router.get("/", async (req, res) => {
    try {
        await handlePriceRequest(req.query || {}, res);
    } catch (err) {
        console.error("Price GET route error:", err);
        res.status(500).json({ success: false, error: "Server error", message: err.message });
    }
});

export default router;