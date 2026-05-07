import tensorflow as tf
import cv2
import numpy as np


classes = ['A', 'B', 'C', 'rotten']

model = tf.keras.models.load_model("vegetable_grading_model.h5")

image_path = r"D:\FarmerProject\mine\Agricultural-Produce-Grading\ML_Model\Old\images (12).jpg"

image = cv2.imread(image_path)

if image is None:
    print(" Error: Image not found or wrong path")
    exit()

image = cv2.resize(image, (224, 224))
image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)  
image = image / 255.0
image = np.expand_dims(image, axis=0)

prediction = model.predict(image, verbose=0)

index = np.argmax(prediction)
confidence = float(np.max(prediction))

print(" Predicted Grade:", classes[index])
print(" Confidence:", round(confidence * 100, 2), "%")