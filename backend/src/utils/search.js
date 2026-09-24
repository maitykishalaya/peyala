/**
 * Central Search Utility for Peyala POS (Backend)
 * Provides case-insensitive, typo-tolerant, space-tolerant, and partial-matching search logic.
 */

// Damerau-Levenshtein distance calculation (handles insertions, deletions, substitutions, and transpositions)
function damerauLevenshtein(a, b) {
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  if (Math.abs(la - lb) > 3) return Math.abs(la - lb);

  const d = [];
  for (let i = 0; i <= la; i++) {
    d[i] = [i];
  }
  for (let j = 0; j <= lb; j++) {
    d[0][j] = j;
  }

  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,        // deletion
        d[i][j - 1] + 1,        // insertion
        d[i - 1][j - 1] + cost   // substitution
      );

      // transposition
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }

  return d[la][lb];
}

function normalizeStr(str) {
  if (str == null) return '';
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks if a single query token matches a target word.
 */
function tokenMatchesWord(token, word) {
  if (!token || !word) return false;

  // Exact word
  if (word === token) return true;

  // Prefix match (e.g. "chil" matches "chilleda")
  if (word.startsWith(token)) return true;

  // Substring match (e.g. "chill" in "chilleda", "chick" in "chicken")
  if (word.includes(token)) return true;

  const tLen = token.length;
  const wLen = word.length;

  // For very short tokens (<= 2 chars), only exact / prefix / substring allowed
  if (tLen <= 2) {
    return false;
  }

  // For 3-letter tokens:
  if (tLen === 3) {
    if (wLen === 3 && token[0] === word[0] && damerauLevenshtein(token, word) <= 1) {
      return true;
    }
    return false;
  }

  // For 4-letter tokens:
  if (tLen === 4) {
    if (wLen === 4 && token[0] === word[0] && damerauLevenshtein(token, word) <= 1) {
      return true;
    }
    // Prefix matches for length 4 must be exact to prevent "chil" matching "chicken"
    return false;
  }

  // For tokens with length 5+:
  const maxDist = tLen <= 7 ? 1 : 2;

  // Full word comparison
  if (Math.abs(wLen - tLen) <= maxDist) {
    if (damerauLevenshtein(token, word) <= maxDist) {
      return true;
    }
  }

  // Prefix comparison for longer target words (e.g. "chileda" [len 7] matching prefix of "chilledas" [len 9])
  if (wLen > tLen) {
    const candPrefixes = [
      word.slice(0, tLen),
      word.slice(0, tLen + 1),
      word.slice(0, tLen - 1),
    ];
    for (const p of candPrefixes) {
      if (Math.abs(p.length - tLen) <= maxDist && damerauLevenshtein(token, p) <= maxDist) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Checks if a token matches anywhere in any target word or combined string.
 */
function tokenMatchesAny(token, allTargetWords, targetStrings, targetStringsNoSpace) {
  // 1. Check against individual words
  for (const word of allTargetWords) {
    if (tokenMatchesWord(token, word)) {
      return true;
    }
  }

  // 2. Check if token is a substring of any target string
  for (const t of targetStrings) {
    if (t.includes(token)) {
      return true;
    }
  }

  // 3. Check space-collapsed target strings (handles tokens that were split across words)
  const tokenNoSpace = token.replace(/\s+/g, '');
  for (const tNoSpace of targetStringsNoSpace) {
    if (tNoSpace.includes(tokenNoSpace)) {
      return true;
    }
  }

  // 4. Fuzzy window check on space-collapsed target if token is long enough
  if (tokenNoSpace.length >= 5) {
    const maxDist = tokenNoSpace.length <= 7 ? 1 : 2;
    for (const tNoSpace of targetStringsNoSpace) {
      if (tNoSpace.length >= tokenNoSpace.length - maxDist) {
        for (let i = 0; i <= tNoSpace.length - tokenNoSpace.length + maxDist; i++) {
          for (let len = tokenNoSpace.length - 1; len <= tokenNoSpace.length + 1; len++) {
            if (i + len <= tNoSpace.length && Math.abs(len - tokenNoSpace.length) <= maxDist) {
              const windowStr = tNoSpace.slice(i, i + len);
              if (damerauLevenshtein(tokenNoSpace, windowStr) <= maxDist) {
                return true;
              }
            }
          }
        }
      }
    }
  }

  return false;
}

/**
 * Main search matching function.
 * @param {string|number|Array<string|number|null|undefined>} targets - One or more target strings/fields
 * @param {string|null|undefined} query - The search query
 * @returns {boolean} - True if targets match query
 */
function matchesSearch(targets, query) {
  if (query == null) return true;
  const qTrimmed = String(query).trim();
  if (qTrimmed === '') return true;

  const targetList = (Array.isArray(targets) ? targets : [targets])
    .filter((t) => t != null && t !== '')
    .map((t) => String(t));

  if (targetList.length === 0) return false;

  const normQuery = normalizeStr(qTrimmed);
  const normQueryNoSpace = normQuery.replace(/\s+/g, '');

  const normTargets = [];
  const normTargetsNoSpace = [];
  const allTargetWords = [];

  for (const t of targetList) {
    const norm = normalizeStr(t);
    if (!norm) continue;
    normTargets.push(norm);

    // Fast path: Exact match or substring match
    if (norm === normQuery || norm.includes(normQuery)) {
      return true;
    }

    const noSpace = norm.replace(/\s+/g, '');
    normTargetsNoSpace.push(noSpace);

    // Fast path: Space-collapsed match (e.g. "chill eda" matching "chilleda")
    if (noSpace.includes(normQueryNoSpace)) {
      return true;
    }

    // Fast path: Alphanumeric match (e.g. "t1" matching "T-1" or "PO 102" matching "PO-102")
    const normAlphaNum = norm.replace(/[^a-z0-9]/g, '');
    const queryAlphaNum = normQuery.replace(/[^a-z0-9]/g, '');
    if (queryAlphaNum && normAlphaNum.includes(queryAlphaNum)) {
      return true;
    }

    // Collect words for token matching
    const words = norm.split(/[\s,./\\-_+()&|:;[\]{}"']+/).filter(Boolean);
    for (const w of words) {
      allTargetWords.push(w);
    }
  }

  if (normTargets.length === 0) return false;

  // Check if whole query matches via fuzzy window on space-collapsed string
  if (normQueryNoSpace.length >= 5) {
    const maxDist = normQueryNoSpace.length <= 7 ? 1 : 2;
    for (const tNoSpace of normTargetsNoSpace) {
      if (tNoSpace.length >= normQueryNoSpace.length - maxDist) {
        for (let i = 0; i <= tNoSpace.length - normQueryNoSpace.length + maxDist; i++) {
          for (let len = normQueryNoSpace.length - 1; len <= normQueryNoSpace.length + 1; len++) {
            if (i + len <= tNoSpace.length && Math.abs(len - normQueryNoSpace.length) <= maxDist) {
              const windowStr = tNoSpace.slice(i, i + len);
              if (damerauLevenshtein(normQueryNoSpace, windowStr) <= maxDist) {
                return true;
              }
            }
          }
        }
      }
    }
  }

  // Multi-token matching: Every token in the query must match something in the targets
  const queryTokens = normQuery.split(' ').filter(Boolean);
  if (queryTokens.length <= 1) {
    // Single token was already checked or was not in target
    if (queryTokens.length === 1) {
      return tokenMatchesAny(queryTokens[0], allTargetWords, normTargets, normTargetsNoSpace);
    }
    return false;
  }

  for (const token of queryTokens) {
    if (!tokenMatchesAny(token, allTargetWords, normTargets, normTargetsNoSpace)) {
      return false;
    }
  }

  return true;
}

/**
 * Computes a search relevance score. Higher score = better match.
 * @param {string|number|Array<string|number|null|undefined>} targets
 * @param {string|null|undefined} query
 * @returns {number}
 */
function getSearchScore(targets, query) {
  if (query == null) return 1;
  const qTrimmed = String(query).trim();
  if (qTrimmed === '') return 1;

  const targetList = (Array.isArray(targets) ? targets : [targets])
    .filter((t) => t != null && t !== '')
    .map((t) => String(t));

  if (targetList.length === 0) return 0;

  const normQuery = normalizeStr(qTrimmed);
  const normQueryNoSpace = normQuery.replace(/\s+/g, '');

  let bestScore = 0;

  for (const t of targetList) {
    const norm = normalizeStr(t);
    if (!norm) continue;

    if (norm === normQuery) {
      bestScore = Math.max(bestScore, 1000);
      continue;
    }

    if (norm.startsWith(normQuery)) {
      bestScore = Math.max(bestScore, 850);
      continue;
    }

    if (norm.includes(normQuery)) {
      bestScore = Math.max(bestScore, 700);
      continue;
    }

    const noSpace = norm.replace(/\s+/g, '');
    if (noSpace === normQueryNoSpace) {
      bestScore = Math.max(bestScore, 900);
      continue;
    }
    if (noSpace.startsWith(normQueryNoSpace)) {
      bestScore = Math.max(bestScore, 800);
      continue;
    }
    if (noSpace.includes(normQueryNoSpace)) {
      bestScore = Math.max(bestScore, 650);
      continue;
    }
  }

  if (bestScore > 0) return bestScore;

  // Fallback to general match
  if (matchesSearch(targets, query)) {
    return 300;
  }

  return 0;
}

/**
 * Filter an array of items by search query.
 */
function filterBySearch(items, query, getTargets) {
  if (!Array.isArray(items)) return [];
  if (!query || !String(query).trim()) return items;
  return items.filter((item) => matchesSearch(getTargets ? getTargets(item) : item, query));
}

/**
 * Sort array of items by search relevance while maintaining relative order of equal items.
 */
function sortBySearchRelevance(items, query, getTargets) {
  if (!Array.isArray(items)) return [];
  if (!query || !String(query).trim()) return items;

  return [...items]
    .map((item, index) => ({
      item,
      index,
      score: getSearchScore(getTargets ? getTargets(item) : item, query),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item);
}

function isExactMatch(target, query) {
  if (target == null || query == null) return false;
  return normalizeStr(target) === normalizeStr(query);
}

module.exports = {
  matchesSearch,
  getSearchScore,
  filterBySearch,
  sortBySearchRelevance,
  isExactMatch,
  normalizeStr,
  damerauLevenshtein,
};
