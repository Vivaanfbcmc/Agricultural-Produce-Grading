import express from "express";
import { getVegetablePrice, AgmarknetPriceFetcher } from "./priceapi.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { state, district, commodity, grade } = req.body || {};

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

    const min = Number(data.minPrice) || 0;
    const modal = Number(data.modalPrice) || 0;
    const max = Number(data.maxPrice) || 0;

    const selected =
        g === "A" ? max :
            g === "B" ? modal :
                g === "C" ? min :
                    modal;

    const type =
        g === "A" ? "max_price" :
            g === "B" ? "modal_price" :
                g === "C" ? "min_price" :
                    "modal_price";

    res.json({
      success: true,
      min_price: min,
      modal_price: modal,
      max_price: max,
      selected_price: selected,
      selected_price_type: type,
      raw: data
    });
  } catch (err) {
    console.error("Price route error:", err);
    res.status(500).json({
      success: false,
      error: "Server error",
      message: err.message
    });
  }
});

router.get("/", async (req, res) => {
  try {
    const { state, district, commodity, grade } = req.query || {};

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

    const min = Number(data.minPrice) || 0;
    const modal = Number(data.modalPrice) || 0;
    const max = Number(data.maxPrice) || 0;

    const selected =
        g === "A" ? max :
            g === "B" ? modal :
                g === "C" ? min :
                    modal;

    const type =
        g === "A" ? "max_price" :
            g === "B" ? "modal_price" :
                g === "C" ? "min_price" :
                    "modal_price";

    res.json({
      success: true,
      min_price: min,
      modal_price: modal,
      max_price: max,
      selected_price: selected,
      selected_price_type: type,
      raw: data
    });
  } catch (err) {
    console.error("Price GET route error:", err);
    res.status(500).json({
      success: false,
      error: "Server error",
      message: err.message
    });
  }
});

export default router;
