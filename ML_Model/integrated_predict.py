import os
import traceback
import cv2
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS

# ── LOAD GRADING MODEL ─────────────────────────────────────────
IMG_SIZE      = 224
GRADE_CLASSES = ['A', 'B', 'C', 'rotten']

grading_model = None

try:
    from tensorflow.keras.models import load_model
    MODEL_PATH = os.path.join(os.path.dirname(__file__), "vegetable_grading_model.h5")
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(f"Model file not found at: {MODEL_PATH}")
    grading_model = load_model(MODEL_PATH)
    print(f"Grading model loaded from {MODEL_PATH}")
except Exception as e:
    print(f"Failed to load grading model: {e}")
    traceback.print_exc()

# ── LOAD TOMATO DETECTOR ───────────────────────────────────────
tomato_detector_available = False
try:
    from predict import is_tomato
    tomato_detector_available = True
    print("Tomato detector loaded from predict.py")
except Exception as e:
    print(f"Could not import predict.py: {e} — tomato detection disabled")

# ── HELPERS ────────────────────────────────────────────────────
def decode_image(file_storage):
    file_storage.seek(0)
    arr = np.frombuffer(file_storage.read(), np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)

def preprocess(img_bgr):
    img = cv2.resize(img_bgr, (IMG_SIZE, IMG_SIZE))
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    img = img.astype("float32") / 255.0
    return np.expand_dims(img, axis=0)

def predict_grade(img_bgr):
    processed  = preprocess(img_bgr)
    prediction = grading_model.predict(processed, verbose=0)
    index      = int(np.argmax(prediction))
    confidence = float(np.max(prediction))
    return GRADE_CLASSES[index], round(confidence * 100, 2)

# ── FLASK ──────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)

@app.route('/analyze', methods=['POST', 'OPTIONS'])
def analyze_image():
    if request.method == 'OPTIONS':
        return jsonify({"success": True}), 200

    if grading_model is None:
        return jsonify({
            "success": False,
            "message": "Grading model not loaded. Check vegetable_grading_model.h5 exists next to app.py."
        }), 500

    if 'image' not in request.files:
        return jsonify({"success": False, "message": "No image uploaded"}), 400

    try:
        img = decode_image(request.files['image'])
        if img is None:
            return jsonify({"success": False, "message": "Could not decode image. Upload a valid JPG or PNG."}), 400

        # Step 1: Tomato detection (if available)
        if tomato_detector_available:
            try:
                detection = is_tomato(img)
                if not detection["is_tomato"]:
                    return jsonify({
                        "success":        False,
                        "is_tomato":      False,
                        "detected_as":    detection.get("detected_as", "unknown"),
                        "detection_conf": detection.get("confidence", 0),
                        "grade":          None,
                        "confidence":     None,
                        "message": (
                            f"This does not appear to be a tomato "
                            f"(detected as: {detection.get('detected_as') or 'unknown'}, "
                            f"{detection.get('confidence', 0)}% confidence). "
                            f"Please upload a clear tomato image."
                        )
                    }), 200
            except Exception as det_err:
                print(f" Tomato detection error (skipping): {det_err}")

        # Step 2: Grade
        grade, grade_conf = predict_grade(img)
        return jsonify({
            "success":        True,
            "is_tomato":      True,
            "detected_as":    "tomato",
            "detection_conf": 100.0,
            "grade":          grade,
            "confidence":     grade_conf,
            "message":        f"Grade {grade.upper()} — {grade_conf}% confidence"
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "message": f"Server error: {str(e)}"}), 500

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status":          "ok",
        "grading_model":   "loaded" if grading_model else "NOT LOADED",
        "tomato_detector": "loaded" if tomato_detector_available else "disabled"
    })

if __name__ == "__main__":
    print(" VEGEGRADE ML API → http://localhost:5001")
    print(f"   Grading model  : {'loaded' if grading_model else ' NOT LOADED'}")
    print(f"   Tomato detector: {'loaded' if tomato_detector_available else 'disabled'}")
    app.run(port=5001, debug=True, threaded=True)