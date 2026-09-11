// ─────────────────────────────────────────────────────────────────
// Thermal Printer Utility for 80mm Receipt / KOT Printers
// Supports "Test Mode" (on-screen preview & PDF dialog) and "Production Mode" (silent printing)
// Matches Peyala's official customer bill & kitchen ticket formats
// ─────────────────────────────────────────────────────────────────

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
  if (typeof window === 'undefined') return 'test';
  const saved = localStorage.getItem('peyala_pos_print_mode');
  return saved === 'production' ? 'production' : 'test';
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
}

export interface BillPrintData {
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
  isPaid?: boolean;
}

// ── Print Trigger via Hidden Iframe (Used in Production / Silent Print) ──
export function printThermalSlip(html: string) {
  if (typeof window === 'undefined') return;

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
  }, 300);
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

  const rows = data.items
    .map((item, idx) => {
      const notesHtml = item.notes?.trim()
        ? `<div style="padding-left: 20px; font-size: 11px; font-weight: bold; color: #111; margin-top: 2px;">
             &gt;&gt; NOTE: ${escapeHtml(item.notes.trim())}
           </div>`
        : '';

      return `
        <tr>
          <td style="width: 28px; vertical-align: top; font-weight: bold; font-size: 13px;">${idx + 1}.</td>
          <td style="vertical-align: top; font-size: 13px; font-weight: 600;">
            ${escapeHtml(item.name)}
            ${notesHtml}
          </td>
          <td style="width: 45px; text-align: right; vertical-align: top; font-size: 15px; font-weight: 900;">
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
          @page {
            size: 80mm auto;
            margin: 2mm 3mm;
          }
          @media print {
            body { width: 74mm; margin: 0 auto; }
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            font-size: 12px;
            line-height: 1.35;
            color: #000;
            background: #fff;
            width: 74mm;
            margin: 0 auto;
            padding: 2mm 1mm;
            box-sizing: border-box;
          }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 4px 0; }
          .divider-solid { border-top: 2px solid #000; margin: 5px 0; }
          .table-box {
            border: 2.5px solid #000;
            padding: 6px 4px;
            margin: 6px 0;
            text-align: center;
            border-radius: 4px;
          }
          .table-title {
            font-size: 26px;
            font-weight: 900;
            letter-spacing: 0.5px;
            line-height: 1.1;
          }
          .round-tag {
            font-size: 12px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-top: 2px;
          }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 3px 0; }
        </style>
      </head>
      <body>
        <div class="center" style="font-size: 15px; font-weight: 900; letter-spacing: 1px;">
          ${STORE_INFO.name}
        </div>
        <div class="center" style="font-size: 12px; font-weight: 700; margin-top: 1px;">
          KITCHEN ORDER TICKET (KOT)
        </div>

        <!-- Big & Bold Table + KOT Number Box -->
        <div class="table-box">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 4px; margin-bottom: 5px;">
            <span style="font-size: 16px; font-weight: 900; letter-spacing: 0.5px;">KOT NO: #${escapeHtml(String(kotDisplay))}</span>
            <span class="round-tag" style="margin: 0;">${escapeHtml(roundTag)}</span>
          </div>
          <div class="table-title">TABLE: ${escapeHtml(data.tableNumber)}</div>
        </div>

        <!-- Meta Info -->
        <div style="font-size: 11px; display: flex; justify-content: space-between; margin-bottom: 2px;">
          <div><b>KOT No:</b> #${escapeHtml(String(kotDisplay))}</div>
          <div><b>Time:</b> ${timeStr}</div>
        </div>
        <div style="font-size: 11px; display: flex; justify-content: space-between; margin-bottom: 4px;">
          <div><b>Date:</b> ${dateStr}</div>
          <div><b>Server:</b> ${escapeHtml(data.billerName || 'Staff')}</div>
        </div>

        <div class="divider-solid"></div>

        <!-- Items Table -->
        <table>
          <thead>
            <tr style="border-bottom: 1px solid #000; font-size: 11px;">
              <th style="text-align: left; width: 28px;">S.No</th>
              <th style="text-align: left;">Item Name</th>
              <th style="text-align: right; width: 45px;">Qty</th>
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
          <span>${totalQty}</span>
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

  // 5% GST split: 2.5% CGST + 2.5% SGST
  const halfTax = Math.round((data.taxAmount / 2) * 100) / 100;

  const rows = data.items
    .map((item, idx) => {
      const lineTotal = item.price * item.quantity;
      return `
        <tr>
          <td style="width: 22px; vertical-align: top;">${idx + 1}.</td>
          <td style="vertical-align: top; padding-right: 4px;">${escapeHtml(item.name)}</td>
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
        <title>Bill - ${data.orderNumber || data.tableNumber}</title>
        <style>
          @page {
            size: 80mm auto;
            margin: 2mm 3mm;
          }
          @media print {
            body { width: 74mm; margin: 0 auto; }
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            font-size: 11.5px;
            line-height: 1.3;
            color: #000;
            background: #fff;
            width: 74mm;
            margin: 0 auto;
            padding: 2mm 1mm;
            box-sizing: border-box;
          }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 4px 0; }
          .divider-solid { border-top: 1px solid #000; margin: 4px 0; }
          .store-box {
            border: 1px solid #999;
            border-radius: 4px;
            padding: 5px;
            margin: 6px 0;
            text-align: center;
            font-size: 10.5px;
            line-height: 1.35;
          }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 2px 0; font-size: 11px; }
          .meta-table td { padding: 1px 0; font-size: 10.5px; vertical-align: top; }
        </style>
      </head>
      <body>
        <!-- Header -->
        <div class="center" style="font-size: 16px; font-weight: 900; letter-spacing: 1px;">
          ${STORE_INFO.name}
        </div>

        <!-- 2-Column Meta -->
        <table class="meta-table" style="margin-top: 6px;">
          <tr>
            <td style="width: 50%;">
              <div style="color: #666; font-size: 9.5px;">Order Number</div>
              <div style="font-weight: 600;">${data.orderNumber ? String(data.orderNumber).slice(-4) : '—'}</div>
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
            <td style="text-align: right; font-weight: 700;">${totalQty}</td>
          </tr>
          <tr>
            <td style="font-weight: 500;">Sub Total</td>
            <td style="text-align: right; font-weight: 600;">&#8377;${data.subtotal.toFixed(2)}</td>
          </tr>
          <tr>
            <td>CGST@2.5 (2.5%)</td>
            <td style="text-align: right;">&#8377;${halfTax.toFixed(2)}</td>
          </tr>
          <tr>
            <td>SGST@2.5 (2.5%)</td>
            <td style="text-align: right;">&#8377;${halfTax.toFixed(2)}</td>
          </tr>
          ${(data.discount || 0) > 0 ? `
            <tr>
              <td>Discount ${data.discountType === 'percentage' && data.discountValue ? `(${data.discountValue}%)` : ''}</td>
              <td style="text-align: right; color: #111;">-&#8377;${Number(data.discount).toFixed(2)}</td>
            </tr>
          ` : ''}
        </table>

        <div class="divider-solid"></div>

        <!-- Total Payable -->
        <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 900; margin: 4px 0;">
          <span>${(data.waivedAmount || 0) > 0 ? 'Total Bill Amount:' : 'Total Payable Amount:'}</span>
          <span>&#8377;${data.total.toFixed(2)}</span>
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
          <div style="display: flex; justify-content: space-between; font-size: 10px; color: #444; margin-bottom: 4px;">
            <span>Payment Mode:</span>
            <span style="font-weight: bold; text-transform: uppercase;">${data.paymentMethod} (PAID)</span>
          </div>
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
      orderNumber: data.orderNumber,
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
