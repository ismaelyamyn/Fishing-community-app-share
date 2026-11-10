// Logistic regression, written out so it needs no libraries.
// Fitted with iteratively reweighted least squares (Newton's method) plus a
// ridge penalty, which stays stable on small data sets. Also: cross-validated AUC.

import { mulberry32, shuffleInPlace } from "./rng";

export type LogisticModel = {
  mean: number[]; // per-feature mean used to standardise
  std: number[]; // per-feature spread used to standardise
  weights: number[]; // on standardised features
  bias: number;
};

const sigmoid = (z: number) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));

// Solves A x = b by Gaussian elimination with partial pivoting
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) throw new Error("Singular matrix");
    [M[col], M[pivot]] = [M[pivot], M[col]];

    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }

  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x;
}

export function trainLogistic(
  X: number[][],
  y: number[],
  l2 = 1.0,
  maxIter = 40
): LogisticModel {
  const n = X.length;
  const d = X[0].length;

  const mean = new Array<number>(d).fill(0);
  const std = new Array<number>(d).fill(1);
  for (let j = 0; j < d; j++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += X[i][j];
    mean[j] = s / n;
    let v = 0;
    for (let i = 0; i < n; i++) v += (X[i][j] - mean[j]) ** 2;
    std[j] = Math.max(Math.sqrt(v / n), 1e-6);
  }

  const Z = X.map((row) => row.map((v, j) => (v - mean[j]) / std[j]));

  // parameter vector: [bias, w1..wd]
  const beta = new Array<number>(d + 1).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    const grad = new Array<number>(d + 1).fill(0);
    const H: number[][] = Array.from({ length: d + 1 }, () => new Array<number>(d + 1).fill(0));

    for (let i = 0; i < n; i++) {
      let z = beta[0];
      for (let j = 0; j < d; j++) z += beta[j + 1] * Z[i][j];
      const p = sigmoid(z);
      const w = Math.max(p * (1 - p), 1e-6);
      const r = y[i] - p;

      grad[0] += r;
      for (let j = 0; j < d; j++) grad[j + 1] += r * Z[i][j];

      H[0][0] += w;
      for (let j = 0; j < d; j++) {
        H[0][j + 1] += w * Z[i][j];
        H[j + 1][0] += w * Z[i][j];
        for (let k = 0; k < d; k++) H[j + 1][k + 1] += w * Z[i][j] * Z[i][k];
      }
    }

    // ridge penalty on the feature weights (not on the bias)
    for (let j = 0; j < d; j++) {
      grad[j + 1] -= l2 * beta[j + 1];
      H[j + 1][j + 1] += l2;
    }

    const step = solve(H, grad);
    let maxStep = 0;
    for (let j = 0; j <= d; j++) {
      beta[j] += step[j];
      maxStep = Math.max(maxStep, Math.abs(step[j]));
    }
    if (maxStep < 1e-6) break;
  }

  return { mean, std, weights: beta.slice(1), bias: beta[0] };
}

export function predictProba(model: LogisticModel, x: number[]): number {
  let z = model.bias;
  for (let j = 0; j < model.weights.length; j++) {
    z += model.weights[j] * ((x[j] - model.mean[j]) / model.std[j]);
  }
  return sigmoid(z);
}

// Area under the ROC curve: the chance that a random good trip is scored higher
// than a random poor one. 0.5 = no better than guessing, 1.0 = perfect.
export function auc(scores: number[], labels: number[]): number {
  const idx = scores.map((_, i) => i).sort((a, b) => scores[a] - scores[b]);
  const ranks = new Array<number>(scores.length);

  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && scores[idx[j + 1]] === scores[idx[i]]) j++;
    const avgRank = (i + j) / 2 + 1; // ties share the average rank
    for (let k = i; k <= j; k++) ranks[idx[k]] = avgRank;
    i = j + 1;
  }

  let pos = 0;
  let rankSum = 0;
  for (let k = 0; k < labels.length; k++) {
    if (labels[k] === 1) {
      pos++;
      rankSum += ranks[k];
    }
  }
  const neg = labels.length - pos;
  if (pos === 0 || neg === 0) return 0.5;
  return (rankSum - (pos * (pos + 1)) / 2) / (pos * neg);
}

// Stratified k-fold cross-validation: every prediction comes from a model that
// never saw that trip, so the score is honest about how well it generalises.
export function crossValidate(
  X: number[][],
  y: number[],
  folds: number,
  seed: number,
  l2 = 1.0
): { auc: number; accuracy: number; baselineAccuracy: number } {
  const rand = mulberry32(seed);
  const pos = y.map((v, i) => (v === 1 ? i : -1)).filter((i) => i >= 0);
  const neg = y.map((v, i) => (v === 0 ? i : -1)).filter((i) => i >= 0);
  shuffleInPlace(pos, rand);
  shuffleInPlace(neg, rand);

  const foldOf = new Array<number>(y.length);
  pos.forEach((idx, k) => (foldOf[idx] = k % folds));
  neg.forEach((idx, k) => (foldOf[idx] = k % folds));

  const predicted = new Array<number>(y.length).fill(0.5);
  for (let f = 0; f < folds; f++) {
    const trainX: number[][] = [];
    const trainY: number[] = [];
    for (let i = 0; i < y.length; i++) {
      if (foldOf[i] !== f) {
        trainX.push(X[i]);
        trainY.push(y[i]);
      }
    }
    const model = trainLogistic(trainX, trainY, l2);
    for (let i = 0; i < y.length; i++) {
      if (foldOf[i] === f) predicted[i] = predictProba(model, X[i]);
    }
  }

  let correct = 0;
  for (let i = 0; i < y.length; i++) if ((predicted[i] >= 0.5 ? 1 : 0) === y[i]) correct++;
  const share = pos.length / y.length;

  return {
    auc: auc(predicted, y),
    accuracy: correct / y.length,
    baselineAccuracy: Math.max(share, 1 - share), // always guessing the commoner outcome
  };
}
