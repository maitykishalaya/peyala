'use client';
import { useState, useEffect } from 'react';
import { X, Printer, ExternalLink, Rocket, Check, FileText } from 'lucide-react';
import {
  SlipPreviewPayload,
  printThermalSlip,
  getPrintMode,
  setPrintMode,
  PrintMode
} from '@/lib/thermal-print';

export default function ThermalPreviewModal() {
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<SlipPreviewPayload | null>(null);
  const [currentMode, setCurrentMode] = useState<PrintMode>('test');
  const [copiedNotification, setCopiedNotification] = useState(false);

  useEffect(() => {
    setCurrentMode(getPrintMode());

    const handlePreview = (e: Event) => {
      const customEvent = e as CustomEvent<SlipPreviewPayload>;
      if (customEvent.detail) {
        setPayload(customEvent.detail);
        setOpen(true);
      }
    };

    const handleModeChange = (e: Event) => {
      const customEvent = e as CustomEvent<PrintMode>;
      if (customEvent.detail) {
        setCurrentMode(customEvent.detail);
      }
    };

    window.addEventListener('peyala_preview_slip', handlePreview);
    window.addEventListener('peyala_pos_print_mode_changed', handleModeChange);

    return () => {
      window.removeEventListener('peyala_preview_slip', handlePreview);
      window.removeEventListener('peyala_pos_print_mode_changed', handleModeChange);
    };
  }, []);

  const handleClose = () => {
    setOpen(false);
    setPayload(null);
  };

  const handlePrintOrPdf = () => {
    if (!payload?.html) return;
    printThermalSlip(payload.html);
  };

  const handleOpenNewTab = () => {
    if (!payload?.html) return;
    const win = window.open('', '_blank');
    if (win) {
      win.document.open();
      win.document.write(payload.html);
      win.document.close();
    }
  };

  const handleSwitchToProduction = () => {
    if (confirm('Switch to Production Mode? Future KOTs and Bills will print silently without showing this preview modal.')) {
      setPrintMode('production');
      setCurrentMode('production');
      setCopiedNotification(true);
      setTimeout(() => setCopiedNotification(false), 3000);
      handleClose();
    }
  };

  if (!open || !payload) return null;

  const isKOT = payload.type === 'kot';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      {/* Dark overlay backdrop */}
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity" onClick={handleClose} />

      {/* Modal dialog */}
      <div className="relative w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-800 z-10 my-auto flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-850">
          <div className="flex items-center gap-2.5">
            <span className="flex h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" />
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white text-sm flex items-center gap-2">
                <span>Test Mode: {isKOT ? 'Kitchen Order Ticket (KOT)' : 'Customer Bill'}</span>
                {payload.tableNumber && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-brand-100 dark:bg-brand-950 text-brand-700 dark:text-brand-300">
                    Table: {payload.tableNumber}
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Visual thermal preview (80mm) · Print to test printer or Save as PDF
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-gray-200/50 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Informational banner */}
        <div className="px-5 py-2.5 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200/60 dark:border-amber-900/40 flex items-center justify-between text-xs text-amber-800 dark:text-amber-300">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span>
              <strong>Currently in Test Mode:</strong> Previewing paper slip before printing. Use <b>&quot;Print / Save as PDF&quot;</b> below to generate a PDF.
            </span>
          </div>
          <button
            onClick={handleSwitchToProduction}
            className="ml-3 px-2.5 py-1 text-[11px] font-bold rounded bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-1 transition-colors flex-shrink-0 shadow-sm"
            title="Enable silent direct printing"
          >
            <Rocket className="w-3 h-3" />
            Go Production Mode
          </button>
        </div>

        {/* Scrollable Receipt Body (Center rendered like actual receipt roll) */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-gray-100 dark:bg-gray-950/70 flex justify-center items-start">
          <div className="w-[330px] bg-white text-black shadow-2xl rounded-sm border border-gray-300 overflow-hidden relative">
            {/* Paper top serrated effect */}
            <div className="h-2 bg-white border-b border-dashed border-gray-300" />

            {/* Embedded Standalone 80mm HTML */}
            <iframe
              srcDoc={payload.html}
              title="Receipt Preview"
              className="w-full h-[460px] border-none bg-white"
              sandbox="allow-same-origin"
            />

            {/* Paper bottom tear-off effect */}
            <div className="h-2 bg-white border-t border-dashed border-gray-300" />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <button
              type="button"
              onClick={handleOpenNewTab}
              className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open in New Tab
            </button>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={handleClose}
              className="btn-secondary text-xs py-2 px-4"
            >
              Close
            </button>

            <button
              type="button"
              onClick={handlePrintOrPdf}
              className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5 shadow-md hover:shadow-lg transition-all"
            >
              <Printer className="w-4 h-4" />
              Print / Save as PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
