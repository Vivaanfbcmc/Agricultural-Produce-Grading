import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { AgmarknetPriceFetcher } from "./priceapi.js";

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const PORT = 3001;

app.get("/", (req, res) => {
    res.json({
        service: "Agmarknet Price API",
        status:  "running",
        usage: {
            POST: "/price → body: { state, district, commodity, grade }",
            GET:  "/price → query: ?state=Maharashtra&district=Sholapur&commodity=Tomato&grade=A"
        },
        example: {
            state:     "Maharashtra",
            district:  "Sholapur",
            commodity: "Tomato",
            grade:     "A  (A=max price, B=modal price, C=min price)"
        }
    });
});

app.post("/price", async (req, res) => {
    const { state, district, commodity, grade } = req.body || {};

    if (!state || !district || !commodity || !grade) {
        return res.status(400).json({ success: false, message: "Missing parameters: state, district, commodity, grade" });
    }

    try {
        const fetcher = new AgmarknetPriceFetcher();
        const result  = await fetcher.getPrice(state, district, commodity, grade);

        if (!result.success || !result.data) {
            return res.status(404).json({ success: false, message: result.message || "No price data found" });
        }

        const data  = result.data;
        const g     = grade.toString().toUpperCase();
        const min   = Number(data.minPrice)   || 0;
        const modal = Number(data.modalPrice) || 0;
        const max   = Number(data.maxPrice)   || 0;

        const selected =
            g === "A" ? max :
            g === "B" ? modal :
            g === "C" ? min : modal;

        return res.json({
            success:       true,
            grade:         g,
            // Main price
            price:         selected,
            price_type:    g === "A" ? "max_price" : g === "B" ? "modal_price" : "min_price",
            price_display: `₹${selected.toLocaleString('en-IN')} per quintal`,
            // All prices
            min_price:     min,
            modal_price:   modal,
            max_price:     max,
            // Details
            commodity:     data.commodity  || commodity,
            market:        data.market     || '',
            district:      data.district   || district,
            state:         data.state      || state,
            arrival_date:  data.arrivalDate || '',
            timestamp:     new Date().toISOString()
        });

    } catch (err) {
        console.error("Price server error:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

app.get("/price", async (req, res) => {
    const { state, district, commodity, grade } = req.query || {};

    if (!state || !district || !commodity || !grade) {
        return res.status(400).json({ success: false, message: "Missing parameters: state, district, commodity, grade" });
    }

    try {
        const fetcher = new AgmarknetPriceFetcher();
        const result  = await fetcher.getPrice(state, district, commodity, grade);

        if (!result.success || !result.data) {
            return res.status(404).json({ success: false, message: result.message || "No price data found" });
        }

        const data  = result.data;
        const g     = grade.toString().toUpperCase();
        const min   = Number(data.minPrice)   || 0;
        const modal = Number(data.modalPrice) || 0;
        const max   = Number(data.maxPrice)   || 0;

        const selected =
            g === "A" ? max :
            g === "B" ? modal :
            g === "C" ? min : modal;

        return res.json({
            success:       true,
            grade:         g,
            // Main price
            price:         selected,
            price_type:    g === "A" ? "max_price" : g === "B" ? "modal_price" : "min_price",
            price_display: `₹${selected.toLocaleString('en-IN')} per quintal`,
            // All prices
            min_price:     min,
            modal_price:   modal,
            max_price:     max,
            // Details
            commodity:     data.commodity  || commodity,
            market:        data.market     || '',
            district:      data.district   || district,
            state:         data.state      || state,
            arrival_date:  data.arrivalDate || '',
            timestamp:     new Date().toISOString()
        });

    } catch (err) {
        console.error("Price GET server error:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

app.listen(PORT, () => {
    console.log(` Price API running on http://localhost:${PORT}`);
    console.log(`   POST http://localhost:${PORT}/price`);
    console.log(`   GET  http://localhost:${PORT}/price?state=Maharashtra&district=Sholapur&commodity=Tomato&grade=A`);
});