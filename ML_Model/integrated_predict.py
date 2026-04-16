import os
import cv2
import numpy as np
import tensorflow as tf
from tensorflow.keras.models import load_model
from flask import Flask, request, jsonify
from flask_cors import CORS

IMG_SIZE = 224
GRADE_CLASSES = ['A', 'B', 'C', 'rotten']

# Load model once
grading_model = load_model("vegetable_grading_model.h5")

def preprocess(img):
    img = cv2.resize(img, (IMG_SIZE, IMG_SIZE))
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    img = img.astype("float32") / 255.0
    img = np.expand_dims(img, axis=0)
    return img

def predict_grade(file):
    arr = np.frombuffer(file.read(), np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        return "rotten", 0.0

    processed = preprocess(img)
    prediction = grading_model.predict(processed, verbose=0)

    index = int(np.argmax(prediction))
    confidence = float(np.max(prediction))

    return GRADE_CLASSES[index], round(confidence * 100, 2)

app = Flask(__name__)
CORS(app)  # Fix CORS for all origins

@app.route('/analyze', methods=['POST', 'OPTIONS'])
def analyze_image():
    if request.method == 'OPTIONS':
        return jsonify({"success": True}), 200

    if 'image' not in request.files:
        return jsonify({"success": False, "message": "No image uploaded"}), 400

    try:
        grade, confidence = predict_grade(request.files['image'])
        return jsonify({
            "success": True,
            "grade": grade,
            "confidence": confidence
        })
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

if __name__ == "__main__":
    print("ML API running on http://localhost:5001")
    app.run(port=5001, threaded=True)