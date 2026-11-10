// A deliberately simple word-list reader for review text. It only NUDGES a rating:
// the effect is capped at +/-0.3 stars, so the star rating always decides.
// Limitations: English only (Dhivehi text gets no nudge), no sarcasm detection.

export const MAX_NUDGE = 0.3;

const POSITIVE = new Set([
  "good", "great", "excellent", "amazing", "awesome", "best", "plenty", "lots", "abundant",
  "productive", "rich", "biting", "bites", "caught", "full", "big", "huge", "easy", "calm",
  "safe", "love", "loved", "nice", "perfect", "fantastic", "reliable", "worth", "wonderful",
  "fun", "healthy", "recommend", "recommended", "generous", "rewarding", "successful",
]);

const NEGATIVE = new Set([
  "bad", "poor", "terrible", "awful", "worst", "nothing", "empty", "slow", "dead", "none",
  "rough", "dangerous", "crowded", "overfished", "disappointing", "disappointed", "waste",
  "boring", "dirty", "unsafe", "scarce", "useless", "hopeless", "failed", "difficult", "strong",
]);

const NEGATORS = new Set([
  "not", "no", "never", "hardly", "without", "cannot", "isn't", "wasn't", "don't", "didn't",
  "doesn't", "won't", "can't", "aren't", "weren't",
]);

const BOOSTERS = new Set(["very", "really", "super", "extremely", "so", "incredibly"]);

// -1 (clearly negative) to +1 (clearly positive); 0 when there is nothing to read
export function sentimentScore(text: string | null | undefined): number {
  if (!text) return 0;
  const tokens = text.toLowerCase().match(/[a-z']+/g) ?? [];
  if (tokens.length < 3) return 0;

  let pos = 0;
  let neg = 0;

  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i];
    const isPos = POSITIVE.has(word);
    const isNeg = NEGATIVE.has(word);
    if (!isPos && !isNeg) continue;

    const negated = (i >= 1 && NEGATORS.has(tokens[i - 1])) || (i >= 2 && NEGATORS.has(tokens[i - 2]));
    const boost = i >= 1 && BOOSTERS.has(tokens[i - 1]) ? 1.5 : 1;

    const positive = negated ? !isPos : isPos;
    if (positive) pos += boost;
    else neg += boost;
  }

  // the +2 keeps one stray word from producing an extreme score
  return (pos - neg) / (pos + neg + 2);
}

export function textNudge(text: string | null | undefined): number {
  return MAX_NUDGE * sentimentScore(text);
}

export function adjustedRating(rating: number, text: string | null | undefined): number {
  return Math.min(5, Math.max(1, rating + textNudge(text)));
}
