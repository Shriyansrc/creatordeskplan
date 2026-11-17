importScripts("./vision.js");
const { FilesetResolver, ImageSegmenter } = Vision;
let segmenter;
onmessage = async ({ data }) => {
  try {
    if (data.type === "init") {
      const vision = await FilesetResolver.forVisionTasks(
        new URL(".", self.location.href).href.replace(/\/$/, ""),
      );
      segmenter = await ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: new URL("./selfie.tflite", self.location.href).href,
          delegate: "CPU",
        },
        runningMode: "IMAGE",
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });
      postMessage({ id: data.id, ready: true });
    } else {
      if (!segmenter) throw Error("Segmenter not ready");
      const start = performance.now();
      const result = segmenter.segment(data.bitmap);
      const mask = result.confidenceMasks?.[0];
      if (!mask) throw Error("No person mask returned");
      const floats = mask.getAsFloat32Array(),
        alpha = new Uint8ClampedArray(floats.length);
      for (let i = 0; i < floats.length; i++)
        alpha[i] = Math.round(
          Math.max(0, Math.min(1, (floats[i] - 0.1) / 0.8)) * 255,
        );
      postMessage(
        {
          id: data.id,
          width: mask.width,
          height: mask.height,
          alpha,
          ms: performance.now() - start,
        },
        [alpha.buffer],
      );
      result.close();
      data.bitmap.close();
    }
  } catch (e) {
    postMessage({ id: data.id, error: e.message });
  }
};
