from ultralytics import YOLO

model_path = "runs/detect/train4/weights/best.pt"
model = YOLO(model_path)

# Validate the model
metrics = model.val()
print(metrics)
