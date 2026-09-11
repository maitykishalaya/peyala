// ─────────────────────────────────────────────────────────────────
// Indian Standard Time (Asia/Kolkata) Date Utilities
// Prevents timezone shifts across server hosts (UTC) and local POS machines.
// ─────────────────────────────────────────────────────────────────

/**
 * Returns exact start (00:00:00.000) and end (23:59:59.999) of an IST calendar day.
 * Works uniformly regardless of server machine timezone.
 *
 * @param {string|Date} [dateInput] - Date instance or YYYY-MM-DD string
 * @returns {{ istDateStr: string, start: Date, end: Date, canonicalDate: Date }}
 */
function getIstDayRange(dateInput = new Date()) {
  let istDateStr = '';

  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    istDateStr = dateInput.trim();
  } else {
    const d = new Date(dateInput);
    // Format YYYY-MM-DD in Asia/Kolkata (+05:30)
    istDateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  }

  const [year, month, day] = istDateStr.split('-').map(Number);

  // Start of day in IST: YYYY-MM-DD 00:00:00.000 +05:30
  // In UTC milliseconds: Date.UTC(year, month - 1, day) - (5.5 * 60 * 60 * 1000)
  const startMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0) - (5.5 * 3600 * 1000);
  const endMs = Date.UTC(year, month - 1, day, 23, 59, 59, 999) - (5.5 * 3600 * 1000);

  const start = new Date(startMs);
  const end = new Date(endMs);
  const canonicalDate = new Date(startMs);

  return {
    istDateStr,
    start,
    end,
    canonicalDate,
  };
}

module.exports = {
  getIstDayRange,
};
