import tensorflow as tf
import numpy as np
from tensorflow.keras.preprocessing import image

model = tf.keras.models.load_model("vegetable_classifier.h5")

img_path = r"C:\Users\victus\tomato_recognization\dataset\test2.jpg"   # your test image
img = image.load_img(img_path, target_size=(224,224))
img_array = image.img_to_array(img)/255.0
img_array = np.expand_dims(img_array, axis=0)

pred = model.predict(img_array)
class_idx = np.argmax(pred)
confidence = np.max(pred)

# Get class names
dataset_path = "dataset"
train_datagen = tf.keras.preprocessing.image.ImageDataGenerator()
train_data = train_datagen.flow_from_directory(dataset_path)
class_names = list(train_data.class_indices.keys())

print("Prediction:", class_names[class_idx])
print("Confidence:", confidence)
