import tensorflow as tf
import numpy as np

def make_gradcam_heatmap(img_tensor, model, last_conv_layer_name):
    try:
        last_conv_layer = model.get_layer(last_conv_layer_name)

        grad_model = tf.keras.models.Model(
            inputs=model.inputs,
            outputs=[last_conv_layer.output, model.outputs[0]]
        )

        with tf.GradientTape() as tape:
            conv_outputs, predictions = grad_model(img_tensor, training=False)
            class_index = tf.argmax(predictions[0])
            loss = predictions[:, class_index]

        grads = tape.gradient(loss, conv_outputs)

        if grads is None:
            return None

        pooled_grads = tf.reduce_mean(grads, axis=(0, 1, 2))
        conv_outputs = conv_outputs[0]

        heatmap = tf.reduce_sum(conv_outputs * pooled_grads, axis=-1)
        heatmap = tf.maximum(heatmap, 0)
        heatmap /= tf.reduce_max(heatmap) + 1e-8

        return heatmap.numpy()

    except Exception:
        return None
