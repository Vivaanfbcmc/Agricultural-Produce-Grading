import os
import cv2
import numpy as np
from segmentation import load_sam_model, get_tomato_mask
from color_classifier import classify_pixels


class TomatoAnalyzer:
    def __init__(self, debug=False):
        self.debug = debug
        self.mask_generator = load_sam_model(debug=debug)

    def analyze(self, image_path: str):
        if not os.path.exists(image_path):
            print(f"[ERROR] File not found: {image_path}")
            return

        image_bgr = cv2.imread(image_path)
        if image_bgr is None:
            print(f"[ERROR] Could not read image: {image_path}")
            return

        h, w = image_bgr.shape[:2]
        filename = os.path.basename(image_path)

        if self.debug:
            print(f"\n[Image] {filename}  |  {w}x{h} px")

        try:
            binary_mask = get_tomato_mask(image_bgr, self.mask_generator, debug=self.debug)
        except Exception as e:
            print(f"[ERROR] Segmentation failed: {e}")
            return

        if self.debug:
            self._save_debug_images(image_bgr, binary_mask, image_path)

        try:
            color_results, total_pixels = classify_pixels(image_bgr, binary_mask)
        except Exception as e:
            print(f"[ERROR] Color classification failed: {e}")
            return

        self._print_results(filename, total_pixels, color_results)

    def _print_results(self, filename, total_pixels, color_results):
        print()
        print("=" * 50)
        print(f"  RESULTS — {filename}")
        print("=" * 50)
        print(f"  Total tomato area : {total_pixels:,} pixels")
        print()
        print(f"  {'Color':<20} {'Hex':<10} {'Pixels':>10}  {'%':>7}")
        print(f"  {'-'*20} {'-'*10} {'-'*10}  {'-'*7}")

        for r in color_results:
            if r["percentage"] == 0.0:
                continue
            print(
                f"  {r['label']:<20} {r['hex']:<10} "
                f"{r['count']:>10,}  {r['percentage']:>6.2f}%"
            )

        print("=" * 50)

        top = [r for r in color_results if r["percentage"] >= 1.0]
        summary_parts = [f"{r['percentage']:.1f}% {r['label']}" for r in top]
        print(f"\n  SUMMARY: {filename} → " + ", ".join(summary_parts))
        print()

    def _save_debug_images(self, image_bgr, binary_mask, image_path):
        base, _ = os.path.splitext(image_path)

        mask_path = f"{base}_mask.jpg"
        cv2.imwrite(mask_path, binary_mask)
        print(f"[Debug] Mask saved    → {mask_path}")

        overlay = image_bgr.copy()
        green_tint = np.zeros_like(image_bgr)
        green_tint[:] = (0, 255, 0)
        mask_bool = binary_mask > 0
        overlay[mask_bool] = cv2.addWeighted(image_bgr, 0.5, green_tint, 0.5, 0)[mask_bool]
        contours, _ = cv2.findContours(binary_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(overlay, contours, -1, (0, 0, 255), 2)

        overlay_path = f"{base}_overlay.jpg"
        cv2.imwrite(overlay_path, overlay)
        print(f"[Debug] Overlay saved → {overlay_path}")