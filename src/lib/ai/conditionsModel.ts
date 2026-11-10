// Module 2 (part 2): "how likely is a good trip in today's conditions?"
// Trains on every logged trip that has weather attached. The model is only
// marked usable if it really beats guessing in cross-validation; otherwise the
// recommender ignores it and says so.

import { Conditions, computeFill, FEATURE_GROUPS, FEATURE_NAMES, FillValues, toFeatures } from "./features";
import { crossValidate, LogisticModel, predictProba, trainLogistic } from "./logistic";

export const MIN_SAMPLES = 30;
export const MIN_PER_CLASS = 8;
export const MIN_CV_AUC = 0.6;

export type TrainingTrip = Conditions & { goodCatch: boolean };

export type TrainedModel = {
  usable: boolean;
  reason: string;
  nSamples: number;
  nPositive: number;
  fill: FillValues | null;
  model: LogisticModel | null;
  metrics: { cvAuc: number; cvAccuracy: number; baselineAccuracy: number } | null;
};

export function trainConditionsModel(trips: TrainingTrip[], seed = 42): TrainedModel {
  const n = trips.length;
  const nPos = trips.filter((t) => t.goodCatch).length;
  const nNeg = n - nPos;
  const base = { nSamples: n, nPositive: nPos, fill: null, model: null, metrics: null };

  if (n < MIN_SAMPLES) {
    return { ...base, usable: false, reason: `Only ${n} trips with weather so far; ${MIN_SAMPLES} are needed.` };
  }
  if (nPos < MIN_PER_CLASS || nNeg < MIN_PER_CLASS) {
    return {
      ...base,
      usable: false,
      reason: `Need at least ${MIN_PER_CLASS} good and ${MIN_PER_CLASS} poor trips (have ${nPos} and ${nNeg}).`,
    };
  }

  const fill = computeFill(trips);
  const X = trips.map((t) => toFeatures(t, fill));
  const y = trips.map((t) => (t.goodCatch ? 1 : 0));

  try {
    const cv = crossValidate(X, y, 5, seed);
    const model = trainLogistic(X, y);
    const metrics = { cvAuc: cv.auc, cvAccuracy: cv.accuracy, baselineAccuracy: cv.baselineAccuracy };
    const usable = cv.auc >= MIN_CV_AUC;
    return {
      usable,
      reason: usable
        ? "Model beats guessing in cross-validation."
        : `Cross-validated AUC ${cv.auc.toFixed(2)} is below ${MIN_CV_AUC}: weather alone does not predict catches yet.`,
      nSamples: n,
      nPositive: nPos,
      fill,
      model,
      metrics,
    };
  } catch {
    return { ...base, usable: false, reason: "Training failed (data too uniform)." };
  }
}

export function conditionsProbability(m: TrainedModel, c: Conditions): number | null {
  if (!m.usable || !m.model || !m.fill) return null;
  return predictProba(m.model, toFeatures(c, m.fill));
}

// Plain-language drivers: which groups of conditions push the prediction up or
// down relative to an average day (coefficient x deviation from the training mean).
export function explainConditions(
  m: TrainedModel,
  c: Conditions
): { group: string; effect: number }[] {
  if (!m.usable || !m.model || !m.fill) return [];
  const x = toFeatures(c, m.fill);
  const contrib = new Map<string, number>();

  for (const [group, names] of Object.entries(FEATURE_GROUPS)) {
    let total = 0;
    for (const name of names) {
      const j = FEATURE_NAMES.indexOf(name as (typeof FEATURE_NAMES)[number]);
      total += m.model.weights[j] * ((x[j] - m.model.mean[j]) / m.model.std[j]);
    }
    contrib.set(group, total);
  }

  return [...contrib.entries()]
    .map(([group, effect]) => ({ group, effect }))
    .sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));
}

export function serializeModel(m: TrainedModel): Record<string, unknown> {
  return { fill: m.fill, model: m.model, reason: m.reason };
}

export function deserializeModel(
  row: {
    usable: boolean;
    n_samples: number;
    n_positive: number;
    params: any;
    metrics: any;
  } | null
): TrainedModel | null {
  if (!row || !row.params?.model || !row.params?.fill) return null;
  return {
    usable: row.usable,
    reason: row.params.reason ?? "",
    nSamples: row.n_samples,
    nPositive: row.n_positive,
    fill: row.params.fill,
    model: row.params.model,
    metrics: row.metrics ?? null,
  };
}
