import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { AgmarknetPriceFetcher } from "./priceapi.js";

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const PORT = 3001;

app.post("/price", async (req, res) => {
    const { state, district, commodity, grade } = req.body;
    if (!state || !district || !commodity || !grade) {
        return res.status(400).json({ success: false, message: "Missing parameters" });
    }

    try {
        const fetcher = new AgmarknetPriceFetcher();
        const result = await fetcher.getPrice(state, district, commodity, grade);
        if (result.success && result.data) {
            return res.json({
                success: true,
                selectedPrice: result.data.selectedPrice,
                selectedPriceType: result.data.selectedPriceType,
            });
        }
        return res.json(result);
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

app.listen(PORT, () => console.log(`✅ Price API running on http://localhost:${PORT}`));
