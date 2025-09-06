import fs from "node:fs";
import path from "node:path";

type FeatureVec = Record<string, number>;
type Model = { features: string[]; coef: number[]; intercept: number };

let MODEL: Model | null = null;

function loadModelIfNeeded() {
  if (MODEL) return;
  try {
    const p = path.join(process.cwd(), "public", "model_logreg_v1.json");
    const raw = fs.readFileSync(p, "utf8");
    MODEL = JSON.parse(raw);
  } catch {
    MODEL = null;
  }
}

function sigmoid(z: number) {
  return 1 / (1 + Math.exp(-z));
}

export function scoreWithCurrentModel(features: FeatureVec): number | null {
  loadModelIfNeeded();
  if (!MODEL) return null;

  const { features: fids, coef, intercept } = MODEL;
  let z = intercept;
  for (let i = 0; i < fids.length; i++) {
    const v = Number(features[fids[i]] ?? 0);
    z += coef[i] * v;
  }
  return sigmoid(z); // 0..1
}
