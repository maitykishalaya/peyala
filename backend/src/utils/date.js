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

/**
 * Calculates Indian Financial Year & Quarter according to IST (Asia/Kolkata, UTC+05:30).
 *
 * Quarter breakdown:
 * - Q1: April 1 (00:00:00 IST) to June 30 (23:59:59 IST)
 * - Q2: July 1 (00:00:00 IST) to September 30 (23:59:59 IST)
 * - Q3: October 1 (00:00:00 IST) to December 31 (23:59:59 IST)
 * - Q4: January 1 (00:00:00 IST) to March 31 (23:59:59 IST)
 *
 * @param {string|Date} [dateInput] - Date instance or date string
 * @returns {{ quarterKey: string, fiscalYear: string, quarter: string, quarterNum: number, fiscalStartYear: number, fiscalEndYear: number }}
 */
function getIstFiscalQuarter(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });

  const parts = formatter.formatToParts(d);
  const yearPart = Number(parts.find((p) => p.type === 'year')?.value);
  const monthPart = Number(parts.find((p) => p.type === 'month')?.value); // 1-12

  let fiscalStartYear;
  let quarter;
  let quarterNum;

  if (monthPart >= 4 && monthPart <= 6) {
    // April (4), May (5), June (6) -> Q1
    fiscalStartYear = yearPart;
    quarter = 'Q1';
    quarterNum = 1;
  } else if (monthPart >= 7 && monthPart <= 9) {
    // July (7), August (8), September (9) -> Q2
    fiscalStartYear = yearPart;
    quarter = 'Q2';
    quarterNum = 2;
  } else if (monthPart >= 10 && monthPart <= 12) {
    // October (10), November (11), December (12) -> Q3
    fiscalStartYear = yearPart;
    quarter = 'Q3';
    quarterNum = 3;
  } else {
    // January (1), February (2), March (3) -> Q4 of previous calendar year
    fiscalStartYear = yearPart - 1;
    quarter = 'Q4';
    quarterNum = 4;
  }

  const fiscalEndYear = fiscalStartYear + 1;
  const fyShort = `${String(fiscalStartYear).slice(-2)}${String(fiscalEndYear).slice(-2)}`;
  const fyFull = `${fiscalStartYear}-${String(fiscalEndYear).slice(-2)}`;
  const quarterKey = `FY${fyShort}-${quarter}`;

  return {
    quarterKey,
    fiscalYear: fyFull,
    quarter,
    quarterNum,
    fiscalStartYear,
    fiscalEndYear,
  };
}

module.exports = {
  getIstDayRange,
  getIstFiscalQuarter,
};
