// ─────────────────────────────────────────────────────────────────
// Thermal Printer Utility for 80mm Receipt / KOT Printers
// Supports "Test Mode" (on-screen preview & PDF dialog) and "Production Mode" (silent printing)
// Matches Peyala's official customer bill & kitchen ticket formats
// ─────────────────────────────────────────────────────────────────
import { isBeverageItem } from './utils';

export const STORE_INFO = {
  name: 'PEYALA',
  address: 'L-1, Saratpally, Midnapore',
  phone: '7749802811',
  fssai: '22822149000119',
  gstin: '19DGOPM1101F1ZL',
};

export type PrintMode = 'test' | 'production';

export interface SlipPreviewPayload {
  type: 'kot' | 'bill';
  title: string;
  html: string;
  tableNumber?: string;
  orderNumber?: string | number;
}

export function getPrintMode(): PrintMode {
  if (typeof window === 'undefined') return 'production';
  const saved = localStorage.getItem('peyala_pos_print_mode');
  return saved === 'test' ? 'test' : 'production';
}

export function setPrintMode(mode: PrintMode) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('peyala_pos_print_mode', mode);
  window.dispatchEvent(new CustomEvent('peyala_pos_print_mode_changed', { detail: mode }));
}

export function dispatchSlipPreview(payload: SlipPreviewPayload) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('peyala_preview_slip', { detail: payload }));
}

export interface KOTItem {
  name: string;
  quantity: number;
  notes?: string;
  variantName?: string;
  variant?: { name: string; price?: number } | string;
  addons?: Array<string | { name: string; price?: number }>;
}

export interface KOTPrintData {
  tableNumber: string;
  kotNumber?: string | number;
  orderNumber?: string | number;
  tokenNo?: string | number;
  billerName?: string;
  roundTag?: string; // e.g. '[INITIAL ORDER]' or '[ROUND 2 - ADD-ON]'
  createdAt?: string | Date;
  items: KOTItem[];
}

export interface BillItem {
  name: string;
  quantity: number;
  price: number;
  taxPercent?: number;
  variantName?: string;
  addons?: Array<{ name: string; price: number }>;
}

export interface BillPrintData {
  billNumber?: string | number;
  orderNumber?: string | number;
  tableNumber: string;
  billerName?: string;
  tokenNo?: string | number;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  createdAt?: string | Date;
  items: BillItem[];
  subtotal: number;
  taxAmount: number;
  discount?: number;
  discountType?: 'flat' | 'percentage' | string;
  discountValue?: number;
  total: number;
  settledAmount?: number;
  waivedAmount?: number;
  paymentMethod?: string;
  paymentBreakdown?: { cash?: number; upi?: number; card?: number; due?: number; other?: number };
  isPaid?: boolean;
  isReprint?: boolean;
}

// ── Print Trigger (Native Electron Silent Print or Hidden Iframe Fallback) ──
export function printThermalSlip(html: string) {
  if (typeof window === 'undefined') return;

  // 1. Native Electron Desktop Hardware Silent Print (Fastest, zero-dialog)
  if ((window as any).electronAPI?.printThermal) {
    (window as any).electronAPI
      .printThermal(html)
      .then((res: any) => {
        if (!res?.success) {
          console.warn('[Peyala Thermal Print Warning]', res?.failureReason);
        }
      })
      .catch((err: any) => console.error('[Peyala Thermal Print Error]', err));
    return;
  }

  // 2. Web Browser Fallback via Hidden Iframe (For mobile waiter devices on LAN)
  let iframe = document.getElementById('thermal-print-frame') as HTMLIFrameElement;
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = 'thermal-print-frame';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    document.body.appendChild(iframe);
  }

  const doc = iframe.contentWindow?.document;
  if (!doc) return;

  doc.open();
  doc.write(html);
  doc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (err) {
      console.error('Thermal print failed:', err);
    }
  }, 150);
}

// ── Helper: Format Dates ──────────────────────────────────────────
function formatPrintDate(d: Date = new Date()): { dateStr: string; timeStr: string } {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear()).slice(-2);
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');

  return {
    dateStr: `${day}/${month}/${year}`,
    timeStr: `${hours}:${mins}`,
  };
}

// ─────────────────────────────────────────────────────────────────
// 1. KOT (Kitchen Order Ticket) Generator — 80mm
// ─────────────────────────────────────────────────────────────────
export function generateKOTHtml(data: KOTPrintData): string {
  const { dateStr, timeStr } = formatPrintDate(
    data.createdAt ? new Date(data.createdAt) : new Date()
  );

  const totalQty = data.items.reduce((sum, it) => sum + (Number(it.quantity) || 1), 0);
  const roundTag = data.roundTag || '[INITIAL ORDER]';
  const kotDisplay = data.kotNumber
    ? String(data.kotNumber)
    : data.tokenNo || (data.orderNumber ? String(data.orderNumber).slice(-4) : '1');

  // Food items first, beverage section items appear after food items
  const sortedItems = [...(data.items || [])].sort((a, b) => {
    const aBev = isBeverageItem(a) ? 1 : 0;
    const bBev = isBeverageItem(b) ? 1 : 0;
    return aBev - bBev;
  });

  const rows = sortedItems
    .map((item, idx) => {
      const rawVariant =
        item.variantName ||
        (typeof (item as any).variant === 'string'
          ? (item as any).variant
          : (item as any).variant?.name) ||
        '';
      const vName = typeof rawVariant === 'string' ? rawVariant.trim() : '';
      const variantHtml = vName
        ? ` <span style="font-size: 12.5px; font-weight: 900; color: #000; text-transform: uppercase;">[${escapeHtml(vName)}]</span>`
        : '';
      const addonsList = Array.isArray(item.addons)
        ? item.addons.map((a: any) => (typeof a === 'string' ? a : a?.name || '')).filter(Boolean)
        : [];
      const addonsHtml = addonsList.length > 0
        ? `<div style="padding-left: 12px; font-size: 11px; font-weight: 700; color: #000; margin-top: 1px;">
             + ${addonsList.map(escapeHtml).join(', ')}
           </div>`
        : '';
      const notesHtml = item.notes?.trim()
        ? `<div style="padding-left: 12px; font-size: 11px; font-weight: bold; color: #000; margin-top: 2px;">
             &gt;&gt; NOTE: ${escapeHtml(item.notes.trim())}
           </div>`
        : '';

      return `
        <tr>
          <td style="width: 22px; vertical-align: top; font-weight: bold; font-size: 13px;">${idx + 1}.</td>
          <td style="vertical-align: top; font-size: 13px; font-weight: 600; padding-right: 4px;">
            ${escapeHtml(item.name)}${variantHtml}
            ${addonsHtml}
            ${notesHtml}
          </td>
          <td style="width: 38px; text-align: right; vertical-align: top; font-size: 15px; font-weight: 900; padding-right: 2px;">
            ${item.quantity}
          </td>
        </tr>
      `;
    })
    .join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>KOT - ${data.tableNumber}</title>
        <style>
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          @page {
            size: 80mm auto;
            margin: 0 !important;
          }
          @media print {
            html, body {
              width: 70mm !important;
              max-width: 70mm !important;
              margin: 0 auto !important;
              padding: 0 !important;
              padding-top: 0.5mm !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
          }
          html {
            margin: 0 !important;
            padding: 0 !important;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            font-size: 12px;
            line-height: 1.3;
            color: #000;
            background: #fff;
            width: 70mm;
            max-width: 70mm;
            margin: 0 auto !important;
            padding: 0.5mm 1.5mm 3mm 1.5mm !important;
            box-sizing: border-box;
          }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 3px 0; }
          .divider-solid { border-top: 2px solid #000; margin: 4px 0; }
          .table-box {
            border: 2.5px solid #000;
            padding: 4px 3px;
            margin: 3px 0 4px 0;
            text-align: center;
            border-radius: 4px;
          }
          .table-title {
            font-size: 24px;
            font-weight: 900;
            letter-spacing: 0.5px;
            line-height: 1.1;
          }
          .round-tag {
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin: 0;
          }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 2.5px 0; }
        </style>
      </head>
      <body>
        <div class="center" style="font-size: 14px; font-weight: 900; letter-spacing: 0.5px; line-height: 1.1; margin: 0; padding: 0;">
          ${STORE_INFO.name}
        </div>
        <div class="center" style="font-size: 11px; font-weight: 700; margin: 1px 0 2px 0; letter-spacing: 0.5px;">
          KITCHEN ORDER TICKET (KOT)
        </div>

        <!-- Big & Bold Table + KOT Number Box -->
        <div class="table-box">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 2px; margin-bottom: 3px;">
            <span style="font-size: 15px; font-weight: 900; letter-spacing: 0.5px;">KOT NO: #${escapeHtml(String(kotDisplay))}</span>
            <span class="round-tag">${escapeHtml(roundTag)}</span>
          </div>
          <div class="table-title">TABLE: ${escapeHtml(data.tableNumber)}</div>
        </div>

        <!-- Meta Info -->
        <div style="font-size: 11px; display: flex; justify-content: space-between; margin-bottom: 2px;">
          <div><b>KOT No:</b> #${escapeHtml(String(kotDisplay))}</div>
          <div style="padding-right: 2px;"><b>Time:</b> ${timeStr}</div>
        </div>
        <div style="font-size: 11px; display: flex; justify-content: space-between; margin-bottom: 4px;">
          <div><b>Date:</b> ${dateStr}</div>
          <div style="padding-right: 2px;"><b>Server:</b> ${escapeHtml(data.billerName || 'Staff')}</div>
        </div>

        <div class="divider-solid"></div>

        <!-- Items Table -->
        <table>
          <thead>
            <tr style="border-bottom: 1px solid #000; font-size: 11px;">
              <th style="text-align: left; width: 22px;">S.No</th>
              <th style="text-align: left;">Item Name</th>
              <th style="text-align: right; width: 38px; padding-right: 2px;">Qty</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>

        <div class="divider-solid"></div>

        <!-- Bottom Total Quantity -->
        <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 900; margin-top: 3px;">
          <span>Total Quantity:</span>
          <span style="padding-right: 2px;">${totalQty}</span>
        </div>

        <div class="divider" style="margin-top: 8px;"></div>
        <div class="center" style="font-size: 10px; color: #333;">*** Kitchen Copy ***</div>
      </body>
    </html>
  `;
}

export function printKOT(data: KOTPrintData, forceMode?: PrintMode) {
  const html = generateKOTHtml(data);
  const mode = forceMode || getPrintMode();

  if (mode === 'test') {
    dispatchSlipPreview({
      type: 'kot',
      title: `KOT - Table ${data.tableNumber}`,
      tableNumber: data.tableNumber,
      orderNumber: data.orderNumber,
      html,
    });
  } else {
    printThermalSlip(html);
  }
}

// ─────────────────────────────────────────────────────────────────
// 2. Customer Bill Generator — 80mm
// ─────────────────────────────────────────────────────────────────
export function generateBillHtml(data: BillPrintData): string {
  const { dateStr, timeStr } = formatPrintDate(
    data.createdAt ? new Date(data.createdAt) : new Date()
  );

  const totalQty = data.items.reduce((sum, it) => sum + (Number(it.quantity) || 1), 0);

  // 5% GST split: 2.5% CGST + 2.5% SGST (Calculated on discounted base)
  const halfTax = Math.round((data.taxAmount / 2) * 100) / 100;
  const roundedBillTotal = Math.round(data.total);
  const discountedBase = Math.max(0, data.subtotal - (data.discount || 0));
  const rawCalculatedTotal = discountedBase + halfTax * 2;
  const roundOff = Math.round((roundedBillTotal - rawCalculatedTotal) * 100) / 100;

  const rows = data.items
    .map((item, idx) => {
      const lineTotal = item.price * item.quantity;
      const rawVariant =
        item.variantName ||
        (typeof (item as any).variant === 'string'
          ? (item as any).variant
          : (item as any).variant?.name) ||
        '';
      const vName = typeof rawVariant === 'string' ? rawVariant.trim() : '';
      const variantHtml = vName
        ? `<div style="font-size: 10px; color: #222; font-weight: 700;">(${escapeHtml(vName)})</div>`
        : '';
      const addonsHtml = item.addons && item.addons.length > 0
        ? `<div style="font-size: 9.5px; color: #555;">+ ${item.addons.map((a) => `${escapeHtml(a.name)} (₹${a.price})`).join(', ')}</div>`
        : '';

      return `
        <tr>
          <td style="width: 22px; vertical-align: top;">${idx + 1}.</td>
          <td style="vertical-align: top; padding-right: 4px;">
            ${escapeHtml(item.name)}
            ${variantHtml}
            ${addonsHtml}
          </td>
          <td style="width: 26px; text-align: right; vertical-align: top;">${item.quantity}</td>
          <td style="width: 48px; text-align: right; vertical-align: top;">${item.price}</td>
          <td style="width: 48px; text-align: right; vertical-align: top;">${lineTotal}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Bill - ${data.billNumber || data.orderNumber || data.tableNumber}</title>
        <style>
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          @page {
            size: 80mm auto;
            margin: 0 !important;
          }
          @media print {
            html, body {
              width: 70mm !important;
              max-width: 70mm !important;
              margin: 0 auto !important;
              padding: 0 !important;
              padding-top: 0.5mm !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
          }
          html {
            margin: 0 !important;
            padding: 0 !important;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            font-size: 11.5px;
            line-height: 1.3;
            color: #000;
            background: #fff;
            width: 70mm;
            max-width: 70mm;
            margin: 0 auto !important;
            padding: 0.5mm 1.5mm 3mm 1.5mm !important;
            box-sizing: border-box;
          }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 3px 0; }
          .divider-solid { border-top: 1px solid #000; margin: 3px 0; }
          .store-box {
            border: 1px solid #999;
            border-radius: 4px;
            padding: 4px;
            margin: 4px 0;
            text-align: center;
            font-size: 10.5px;
            line-height: 1.3;
          }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 2px 0; font-size: 11px; }
          .meta-table td { padding: 1px 0; font-size: 10.5px; vertical-align: top; }
        </style>
      </head>
      <body>
        <!-- Header -->
        <div class="center" style="font-size: 15px; font-weight: 900; letter-spacing: 0.5px; line-height: 1.1; margin: 0; padding: 0;">
          ${STORE_INFO.name}
        </div>

        <!-- 2-Column Meta -->
        <table class="meta-table" style="margin-top: 6px;">
          <tr>
            <td style="width: 50%;">
              <div style="color: #666; font-size: 9.5px;">Bill Number</div>
              <div style="font-weight: 700;">${data.billNumber ? String(data.billNumber) : (data.orderNumber ? String(data.orderNumber).slice(-4) : '—')}${data.isReprint ? ' (REPRINT)' : ''}</div>
            </td>
            <td style="width: 50%;">
              <div style="color: #666; font-size: 9.5px;">Date</div>
              <div>${dateStr} ${timeStr}</div>
            </td>
          </tr>
          <tr>
            <td>
              <div style="color: #666; font-size: 9.5px;">Order amount</div>
              <div style="font-weight: 600;">&#8377;${Math.round(data.total)}</div>
            </td>
            <td>
              <div style="color: #666; font-size: 9.5px;">Order type</div>
              <div>Dine In: ${escapeHtml(data.tableNumber)}</div>
            </td>
          </tr>
          <tr>
            <td>
              <div style="color: #666; font-size: 9.5px;">Biller Name</div>
              <div>${escapeHtml(data.billerName || 'biller')}</div>
            </td>
            <td>
              <div style="color: #666; font-size: 9.5px;">Token No.</div>
              <div>${data.tokenNo || (data.orderNumber ? String(data.orderNumber).slice(-2) : '1')}</div>
            </td>
          </tr>
        </table>

        ${data.customerName || data.customerPhone ? `
          <div style="font-size: 10px; margin-top: 4px; border-top: 1px dotted #ccc; padding-top: 3px;">
            <div style="color: #666; font-size: 9px;">Customer Details</div>
            ${data.customerName ? `<div>${escapeHtml(data.customerName)}</div>` : ''}
            ${data.customerPhone ? `<div>${escapeHtml(data.customerPhone)}</div>` : ''}
            ${data.customerAddress ? `<div>${escapeHtml(data.customerAddress)}</div>` : ''}
          </div>
        ` : ''}

        <!-- Store & Legal Box (Exact Match to Photo) -->
        <div class="store-box">
          <div style="font-weight: 700;">${STORE_INFO.address}</div>
          <div>Phone : ${STORE_INFO.phone}</div>
          <div>FSSAI Lic No : ${STORE_INFO.fssai}</div>
          <div>GSTIN : ${STORE_INFO.gstin}</div>
        </div>

        <!-- Items Table -->
        <table>
          <thead>
            <tr style="border-bottom: 1px solid #000; font-size: 10.5px;">
              <th style="text-align: left; width: 22px;">No.</th>
              <th style="text-align: left;">Name</th>
              <th style="text-align: right; width: 26px;">Qty.</th>
              <th style="text-align: right; width: 48px;">Rate(&#8377;)</th>
              <th style="text-align: right; width: 48px;">Price(&#8377;)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colspan="5" style="font-weight: bold; padding-top: 4px; font-size: 10px;">Dine In Menu</td>
            </tr>
            ${rows}
          </tbody>
        </table>

        <div class="divider-solid"></div>

        <!-- Financial Breakdown -->
        <table style="font-size: 11px; margin-top: 2px;">
          <tr>
            <td style="font-weight: 500;">Quantity</td>
            <td style="text-align: right; font-weight: 700; padding-right: 2px;">${totalQty}</td>
          </tr>
          <tr>
            <td style="font-weight: 500;">Sub Total</td>
            <td style="text-align: right; font-weight: 600; padding-right: 2px;">&#8377;${data.subtotal.toFixed(2)}</td>
          </tr>
          ${(data.discount || 0) > 0 ? `
            <tr>
              <td>Discount ${data.discountType === 'percentage' && data.discountValue ? `(${data.discountValue}%)` : ''}</td>
              <td style="text-align: right; color: #111; padding-right: 2px;">-&#8377;${Number(data.discount).toFixed(2)}</td>
            </tr>
            <tr>
              <td style="font-weight: 500;">Taxable Amount</td>
              <td style="text-align: right; font-weight: 600; padding-right: 2px;">&#8377;${discountedBase.toFixed(2)}</td>
            </tr>
          ` : ''}
          <tr>
            <td>CGST@2.5 (2.5%)</td>
            <td style="text-align: right; padding-right: 2px;">&#8377;${halfTax.toFixed(2)}</td>
          </tr>
          <tr>
            <td>SGST@2.5 (2.5%)</td>
            <td style="text-align: right; padding-right: 2px;">&#8377;${halfTax.toFixed(2)}</td>
          </tr>
          ${Math.abs(roundOff) >= 0.01 ? `
            <tr>
              <td>Round Off</td>
              <td style="text-align: right; padding-right: 2px;">${roundOff > 0 ? `+&#8377;${roundOff.toFixed(2)}` : `-&#8377;${Math.abs(roundOff).toFixed(2)}`}</td>
            </tr>
          ` : ''}
        </table>

        <div class="divider-solid"></div>

        <!-- Total Payable -->
        <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 900; margin: 4px 0;">
          <span>${(data.waivedAmount || 0) > 0 ? 'Total Bill Amount:' : 'Total Payable Amount:'}</span>
          <span>&#8377;${roundedBillTotal.toFixed(2)}</span>
        </div>

        ${(data.waivedAmount || 0) > 0 ? `
          <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 600; color: #444; margin: 2px 0;">
            <span>Waived Off Amount:</span>
            <span>-&#8377;${Number(data.waivedAmount).toFixed(2)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 900; margin: 4px 0; border-top: 1px dashed #000; padding-top: 3px;">
            <span>Net Paid / Settled:</span>
            <span>&#8377;${Number(data.settledAmount !== undefined && data.settledAmount !== null ? data.settledAmount : data.total).toFixed(2)}</span>
          </div>
        ` : ''}

        ${data.isPaid && data.paymentMethod ? `
          <div style="display: flex; justify-content: space-between; font-size: 10px; color: #444; margin-bottom: 2px;">
            <span>Payment Mode:</span>
            <span style="font-weight: bold; text-transform: uppercase;">
              ${data.paymentMethod === 'due' ? 'DUE / KHATA' : data.paymentMethod === 'part' ? 'PART PAYMENT' : `${data.paymentMethod} (PAID)`}
            </span>
          </div>
          ${data.paymentMethod === 'part' && data.paymentBreakdown ? `
            <div style="font-size: 9px; color: #444; text-align: right; margin-bottom: 4px; line-height: 1.3;">
              ${[
                data.paymentBreakdown.cash ? `Cash: &#8377;${Number(data.paymentBreakdown.cash).toFixed(2)}` : null,
                data.paymentBreakdown.upi ? `UPI: &#8377;${Number(data.paymentBreakdown.upi).toFixed(2)}` : null,
                data.paymentBreakdown.card ? `Card: &#8377;${Number(data.paymentBreakdown.card).toFixed(2)}` : null,
                data.paymentBreakdown.due ? `Due: &#8377;${Number(data.paymentBreakdown.due).toFixed(2)}` : null,
                data.paymentBreakdown.other ? `Other: &#8377;${Number(data.paymentBreakdown.other).toFixed(2)}` : null,
              ].filter(Boolean).join(' | ')}
            </div>
          ` : ''}
          ${(data.paymentMethod === 'due' || (data.paymentBreakdown && (data.paymentBreakdown.due || 0) > 0)) ? `
            <div style="margin-top: 14px; padding-top: 4px; border-top: 1px dashed #333; font-size: 9.5px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <span>Customer Signature:</span>
                <span>_______________________</span>
              </div>
              <div style="font-size: 8.5px; color: #555; text-align: center;">I acknowledge and agree to clear the outstanding due amount.</div>
            </div>
          ` : ''}
        ` : ''}

        <!-- Secondary Legal info below total -->
        <div class="center" style="font-size: 9.5px; margin-top: 6px; color: #222;">
          <div>FSSAI: ${STORE_INFO.fssai}</div>
          <div>GSTIN: ${STORE_INFO.gstin}</div>
        </div>

        <div class="divider" style="margin-top: 6px;"></div>

        <!-- Footer greeting -->
        <div class="center" style="font-size: 11px; font-weight: 600; margin: 4px 0;">
          Thank You &amp; Visit Again
        </div>
      </body>
    </html>
  `;
}

export function printCustomerBill(data: BillPrintData, forceMode?: PrintMode) {
  const html = generateBillHtml(data);
  const mode = forceMode || getPrintMode();

  if (mode === 'test') {
    dispatchSlipPreview({
      type: 'bill',
      title: `Customer Bill - Table ${data.tableNumber}`,
      tableNumber: data.tableNumber,
      orderNumber: data.billNumber || data.orderNumber,
      html,
    });
  } else {
    printThermalSlip(html);
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
