'use client';

import { useEffect, useRef } from 'react';
import { ordersApi, PendingKotJob, PendingBillJob } from '@/lib/pos-api';
import { printKOT, printCustomerBill } from '@/lib/thermal-print';

const PRINTED_KOTS_CACHE_KEY = 'peyala_printed_kots_v1';

function getPrintedKotSet(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(PRINTED_KOTS_CACHE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function recordKotPrintedLocally(key: string) {
  if (typeof window === 'undefined' || !key) return;
  try {
    const set = getPrintedKotSet();
    set.add(key);
    const arr = Array.from(set).slice(-500);
    localStorage.setItem(PRINTED_KOTS_CACHE_KEY, JSON.stringify(arr));
  } catch {}
}

export default function PrintStationManager() {
  const inFlightKotsRef = useRef<Set<string>>(new Set());
  const inFlightBillsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. Auto-detection / Initialization of Print Station Mode
    const urlParams = new URLSearchParams(window.location.search);
    const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const hasStationParam = urlParams.get('printStation') === 'true' || urlParams.get('kiosk') === 'true';
    const savedStation = localStorage.getItem('peyala_is_print_station');

    if (hasStationParam) {
      localStorage.setItem('peyala_is_print_station', 'true');
      localStorage.setItem('peyala_pos_print_mode', 'production');
    } else if (savedStation === null && isLocalHost) {
      // First boot on the counter machine: default to Station ON & Production mode
      localStorage.setItem('peyala_is_print_station', 'true');
      localStorage.setItem('peyala_pos_print_mode', 'production');
    }

    let isPolling = false;

    const checkPendingPrintJobs = async () => {
      // Re-read dynamically from localStorage so toggle takes effect immediately
      const isStationActive = localStorage.getItem('peyala_is_print_station') === 'true';
      if (!isStationActive) return;

      if (isPolling) return;
      isPolling = true;

      try {
        // 1. Check and Auto-Print Pending KOTs
        const kotRes = await ordersApi.getPendingKots().catch(() => ({ data: [] }));
        const pendingKots: PendingKotJob[] = kotRes.data || [];
        const localPrintedSet = getPrintedKotSet();

        for (const job of pendingKots) {
          const jobKey = `${job.orderId}-${job.roundId}`;
          if (inFlightKotsRef.current.has(jobKey) || localPrintedSet.has(jobKey)) {
            // Already printed locally on this device, mark printed on server to silence queue
            ordersApi.markKotPrinted(job.orderId, job.roundId).catch(() => {});
            continue;
          }

          inFlightKotsRef.current.add(jobKey);
          recordKotPrintedLocally(jobKey);

          printKOT(
            {
              tableNumber: job.tableNumber,
              kotNumber: job.kotNumber,
              orderNumber: job.orderNumber,
              roundTag: job.roundTag,
              billerName: job.billerName,
              createdAt: job.createdAt,
              items: job.items,
            },
            'production'
          );

          await ordersApi.markKotPrinted(job.orderId, job.roundId).catch(() => {});
          window.dispatchEvent(
            new CustomEvent('peyala_kot_printed', {
              detail: { label: `Table ${job.tableNumber} (${job.roundTag})` },
            })
          );
          await new Promise((resolve) => setTimeout(resolve, 400));
        }

        // 2. Check and Auto-Print Pending Customer Bills
        const billRes = await ordersApi.getPendingBills().catch(() => ({ data: [] }));
        const pendingBills: PendingBillJob[] = billRes.data || [];

        for (const bJob of pendingBills) {
          const billKey = `${bJob.orderId}-seq-${bJob.billPrintSeq || 1}`;
          if (inFlightBillsRef.current.has(billKey)) continue;

          inFlightBillsRef.current.add(billKey);

          try {
            printCustomerBill(
              {
                billNumber: bJob.billNumber,
                orderNumber: bJob.orderNumber,
                tokenNo: bJob.tokenNo,
                tableNumber: bJob.tableNumber,
                billerName: bJob.billerName,
                customerName: bJob.customerName,
                customerPhone: bJob.customerPhone,
                customerAddress: bJob.customerAddress,
                customerTotalDue: bJob.customerTotalDue,
                dueAmount: bJob.dueAmount,
                createdAt: bJob.createdAt,
                items: bJob.items,
                subtotal: bJob.subtotal,
                taxAmount: bJob.taxAmount,
                discount: bJob.discount,
                discountType: bJob.discountType,
                discountValue: bJob.discountValue,
                total: bJob.total,
                settledAmount: bJob.settledAmount,
                waivedAmount: bJob.waivedAmount,
                paymentMethod: bJob.paymentMethod,
                paymentBreakdown: bJob.paymentBreakdown,
                isPaid: bJob.isPaid,
              },
              'production'
            );

            await ordersApi.markBillPrinted(bJob.orderId, bJob.billPrintSeq).catch(() => {});
            await new Promise((resolve) => setTimeout(resolve, 400));
          } catch (printErr) {
            console.error('[PrintStation] Failed to auto-print bill for table', bJob.tableNumber, printErr);
          }
        }

        if (inFlightKotsRef.current.size > 200) {
          const arr = Array.from(inFlightKotsRef.current);
          inFlightKotsRef.current = new Set(arr.slice(arr.length - 100));
        }
        if (inFlightBillsRef.current.size > 200) {
          const arr = Array.from(inFlightBillsRef.current);
          inFlightBillsRef.current = new Set(arr.slice(arr.length - 100));
        }
      } catch (err) {
        console.error('[PrintStation] Error polling pending print jobs:', err);
      } finally {
        isPolling = false;
      }
    };

    // Run immediately, then poll every 4 seconds
    checkPendingPrintJobs();
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      checkPendingPrintJobs();
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  return null;
}
