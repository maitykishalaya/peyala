import api from './api';

export interface Addon {
  _id: string;
  name: string;
  price: number;
  isVeg: boolean;
  isActive: boolean;
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface MenuItemVariant {
  _id?: string;
  name: string;
  price: number;
  isVeg?: boolean;
}

export interface MenuCategory {
  _id: string;
  name: string;
  description?: string;
  sortOrder: number;
  isActive: boolean;
  defaultAddons?: Addon[] | string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface MenuItem {
  _id: string;
  name: string;
  category: MenuCategory | string;
  price: number;
  isVeg: boolean;
  taxPercent: number;
  description?: string;
  isAvailable: boolean;
  hasVariants?: boolean;
  variants?: MenuItemVariant[];
  addons?: Addon[] | string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface OrderItem {
  _id?: string;
  menuItem: MenuItem | string;
  name: string;
  price: number;
  taxPercent: number;
  quantity: number;
  notes?: string;
  variant?: { name: string; price: number };
  selectedAddons?: Array<{ addon?: string; name: string; price: number }>;
  status: 'pending' | 'preparing' | 'served' | 'cancelled';
  roundNumber?: number;
  effectiveTime?: string;
  createdAt?: string;
}

export interface KotRound {
  _id: string;
  roundNumber: number;
  roundTag?: string;
  items: Array<{
    name: string;
    quantity: number;
    notes?: string;
    variantName?: string;
    addons?: string[];
  }>;
  printed: boolean;
  printedAt?: string | null;
  createdAt?: string;
  effectiveTime?: string | null;
}

export interface Order {
  _id: string;
  table: {
    _id: string;
    tableNumber: string;
    capacity: number;
    status: string;
  } | string;
  items: OrderItem[];
  status: 'open' | 'preparing' | 'served' | 'billed' | 'paid' | 'cancelled';
  orderNumber?: number;
  billNumber?: number;
  fiscalQuarter?: string;
  billedAt?: string | null;
  tableCategory?: string;
  kotCount?: number;
  kotRounds?: KotRound[];
  subtotal: number;
  taxAmount: number;
  discountType?: 'flat' | 'percentage';
  discountValue?: number;
  discount: number;
  total: number;
  settledAmount?: number | null;
  waivedAmount?: number;
  paymentMethod?: 'cash' | 'card' | 'upi' | 'due' | 'other' | 'part' | null;
  paymentBreakdown?: {
    cash?: number;
    upi?: number;
    card?: number;
    due?: number;
    other?: number;
  };
  customer?: { _id: string; name: string; phone: string; totalDue?: number } | string | null;
  customerName?: string;
  customerPhone?: string;
  dueAmount?: number;
  dueSettled?: boolean;
  dueSettledAmount?: number;
  dueSettledAt?: string | null;
  billPrinted?: boolean;
  billPrintedAt?: string | null;
  billPrintQueued?: boolean;
  billPrintSeq?: number;
  foodServedAt?: string | null;
  effectiveActiveTime?: string | null;
  paidAt?: string | null;
  createdBy?: { _id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

export interface Table {
  _id: string;
  tableNumber: string;
  capacity: number;
  status: 'available' | 'occupied' | 'reserved';
  category?: string;
  activeOrder?: Order | null;
  createdAt?: string;
  updatedAt?: string;
}

// ─────────────────────────────────────────────────────────────────
// Menu API
// ─────────────────────────────────────────────────────────────────
export const menuApi = {
  // Categories
  listCategories: (params?: { includeInactive?: boolean }) =>
    api.get<MenuCategory[]>('/menu/categories', { params }),
  createCategory: (data: Partial<MenuCategory>) =>
    api.post<MenuCategory>('/menu/categories', data),
  updateCategory: (id: string, data: Partial<MenuCategory>) =>
    api.put<MenuCategory>(`/menu/categories/${id}`, data),
  deleteCategory: (id: string) =>
    api.delete<{ message: string }>(`/menu/categories/${id}`),

  // Menu Items
  listItems: (params?: { category?: string; availableOnly?: boolean; search?: string }) =>
    api.get<MenuItem[]>('/menu', { params }),
  getItem: (id: string) =>
    api.get<MenuItem>(`/menu/${id}`),
  createItem: (data: any) =>
    api.post<MenuItem>('/menu', data),
  updateItem: (id: string, data: any) =>
    api.put<MenuItem>(`/menu/${id}`, data),
  toggleAvailability: (id: string) =>
    api.patch<MenuItem>(`/menu/${id}/toggle-availability`),
  deleteItem: (id: string) =>
    api.delete<{ message: string }>(`/menu/${id}`),
};

// ─────────────────────────────────────────────────────────────────
// Addons API
// ─────────────────────────────────────────────────────────────────
export const addonsApi = {
  list: (params?: { includeInactive?: boolean }) =>
    api.get<Addon[]>('/addons', { params }),
  create: (data: Partial<Addon>) =>
    api.post<Addon>('/addons', data),
  update: (id: string, data: Partial<Addon>) =>
    api.put<Addon>(`/addons/${id}`, data),
  delete: (id: string) =>
    api.delete<{ message: string }>(`/addons/${id}`),
};

// ─────────────────────────────────────────────────────────────────
// Tables API
// ─────────────────────────────────────────────────────────────────
export const tablesApi = {
  list: () =>
    api.get<Table[]>('/tables'),
  get: (id: string) =>
    api.get<Table>(`/tables/${id}`),
  create: (data: { tableNumber: string; capacity: number; status?: string; category?: string }) =>
    api.post<Table>('/tables', data),
  update: (id: string, data: Partial<Table>) =>
    api.put<Table>(`/tables/${id}`, data),
  reassignCategory: (id: string, category: string) =>
    api.patch<Table>(`/tables/${id}/category`, { category }),
  delete: (id: string) =>
    api.delete<{ message: string }>(`/tables/${id}`),
};

export interface TableCategory {
  _id: string;
  name: string;
  order?: number;
  color?: string;
  icon?: string;
  description?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export const tableCategoriesApi = {
  list: () =>
    api.get<TableCategory[]>('/tables/categories'),
  create: (data: Partial<TableCategory>) =>
    api.post<TableCategory>('/tables/categories', data),
  update: (id: string, data: Partial<TableCategory>) =>
    api.put<TableCategory>(`/tables/categories/${id}`, data),
  reorder: (categoryIds: string[]) =>
    api.put<TableCategory[]>('/tables/categories/reorder', { categoryIds }),
  delete: (id: string) =>
    api.delete<{ message: string }>(`/tables/categories/${id}`),
};

export interface OutletCategoryTableStat {
  tableId: string;
  tableNumber: string;
  capacity: number;
  status: string;
  totalSales: number;
  orderCount: number;
}

export interface OutletCategoryStat {
  name: string;
  color: string;
  icon: string;
  description?: string;
  totalSales: number;
  orderCount: number;
  tablesCount: number;
  percentage: number;
  avgOrderValue: number;
  tables: OutletCategoryTableStat[];
}

export interface OutletSalesAnalyticsResponse {
  summary: {
    totalSales: number;
    totalOrders: number;
    period: string;
  };
  categories: OutletCategoryStat[];
}

export const outletSalesApi = {
  getAnalytics: (params?: { period?: string; startDate?: string; endDate?: string }) =>
    api.get<OutletSalesAnalyticsResponse>('/tables/analytics/outlet-sales', { params }),
};

export interface PendingKotJob {
  orderId: string;
  roundId: string;
  tableNumber: string;
  orderNumber?: number;
  kotNumber: string;
  roundNumber: number;
  roundTag: string;
  billerName?: string;
  createdAt: string;
  items: Array<{
    name: string;
    quantity: number;
    notes?: string;
    variantName?: string;
    addons?: string[];
  }>;
}

export interface PendingBillJob {
  orderId: string;
  orderNumber?: number;
  billNumber?: number;
  fiscalQuarter?: string;
  billedAt?: string;
  billPrintSeq?: number;
  tokenNo?: string | number;
  tableNumber: string;
  billerName?: string;
  createdAt: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    taxPercent: number;
    notes?: string;
    variantName?: string;
    addons?: Array<{ name: string; price: number }>;
  }>;
  subtotal: number;
  taxAmount: number;
  discount: number;
  discountType?: 'flat' | 'percentage' | string;
  discountValue?: number;
  total: number;
  settledAmount?: number;
  waivedAmount?: number;
  paymentMethod?: string;
  paymentBreakdown?: { cash?: number; upi?: number; card?: number; other?: number };
  isPaid?: boolean;
}

export interface OrderInputItem {
  menuItemId: string;
  quantity: number;
  notes?: string;
  variant?: { name: string; price: number };
  selectedAddons?: Array<{ addonId?: string; name: string; price: number }>;
}

// ─────────────────────────────────────────────────────────────────
// Orders API
// ─────────────────────────────────────────────────────────────────
export interface UpdateSettledOrderPayload {
  items?: Array<{
    menuItem?: string;
    name: string;
    price: number;
    quantity: number;
    taxPercent?: number;
    notes?: string;
    variant?: { name: string; price: number };
    selectedAddons?: Array<{ addon?: string; name: string; price: number }>;
    status?: string;
  }>;
  discountType?: 'flat' | 'percentage';
  discountValue?: number;
  paymentMethod?: 'cash' | 'card' | 'upi' | 'other' | 'part';
  paymentBreakdown?: { cash?: number; upi?: number; card?: number; other?: number };
  settlementAmount?: number;
}

export const ordersApi = {
  list: (params?: { status?: string; page?: number; limit?: number }) =>
    api.get<Order[]>('/orders', { params }),
  get: (id: string) =>
    api.get<Order>(`/orders/${id}`),
  getActiveForTable: (tableId: string) =>
    api.get<Order | null>(`/orders/table/${tableId}/active`),
  create: (data: { tableId: string; items: OrderInputItem[]; shouldPrint?: boolean }) =>
    api.post<Order>('/orders', data),
  addItems: (id: string, items: OrderInputItem[], options?: { shouldPrint?: boolean }) =>
    api.post<Order>(`/orders/${id}/items`, { items, shouldPrint: options?.shouldPrint }),
  updateItem: (id: string, itemId: string, data: { status?: string; quantity?: number; notes?: string }) =>
    api.patch<Order>(`/orders/${id}/items/${itemId}`, data),
  cancelItem: (id: string, itemId: string) =>
    api.delete<Order>(`/orders/${id}/items/${itemId}`),
  applyDiscount: (id: string, data: { discountValue?: number; discountType?: 'flat' | 'percentage'; discount?: number }) =>
    api.patch<Order>(`/orders/${id}/discount`, data),
  markServed: (id: string) =>
    api.post<Order>(`/orders/${id}/mark-served`),
  bill: (id: string) =>
    api.post<Order>(`/orders/${id}/bill`),
  pay: (
    id: string,
    paymentMethod: 'cash' | 'card' | 'upi' | 'due' | 'other' | 'part',
    settlementAmount?: number,
    paymentBreakdown?: { cash?: number; upi?: number; card?: number; due?: number; other?: number },
    customerInfo?: { name: string; phone: string; notes?: string }
  ) =>
    api.post<Order>(`/orders/${id}/pay`, { paymentMethod, settlementAmount, paymentBreakdown, customerInfo }),
  cancel: (id: string) =>
    api.post<Order>(`/orders/${id}/cancel`),
  getPendingKots: () =>
    api.get<PendingKotJob[]>('/orders/pending-kots'),
  markKotPrinted: (orderId: string, roundId: string) =>
    api.post<{ success: boolean; message: string; roundId: string }>(`/orders/${orderId}/rounds/${roundId}/mark-printed`),
  reprintKot: (orderId: string, roundId: string) =>
    api.post<{ success: boolean; message: string; roundId: string }>(`/orders/${orderId}/rounds/${roundId}/reprint`),
  reprintOrderKot: (orderId: string) =>
    api.post<{ success: boolean; message: string }>(`/orders/${orderId}/reprint`),
  getPendingBills: () =>
    api.get<PendingBillJob[]>('/orders/pending-bills'),
  markBillPrinted: (orderId: string, seq?: number) =>
    api.post<{ success: boolean; message: string; orderId: string }>(`/orders/${orderId}/mark-bill-printed`, { seq }),
  queueBillPrint: (orderId: string) =>
    api.post<{ success: boolean; message: string; orderId: string }>(`/orders/${orderId}/queue-bill-print`),
  updateSettled: (id: string, data: UpdateSettledOrderPayload) =>
    api.put<Order>(`/orders/${id}/settled`, data),
  deleteSettled: (id: string) =>
    api.delete<{ message: string; deletedOrderNumber?: number }>(`/orders/${id}/settled`),
  transfer: (
    id: string,
    data: {
      targetTableId: string;
      transferType?: 'table' | 'kot' | 'item';
      kotRoundNumbers?: number[];
      itemTransfers?: Array<{ itemId: string; quantity: number }>;
    }
  ) =>
    api.post<{ success: boolean; message: string; type?: string }>(`/orders/${id}/transfer`, data),
  getKdsActive: () =>
    api.get<KdsActiveResponse>('/orders/kds/active'),
  updateKdsItemStatus: (orderId: string, itemId: string, status: 'pending' | 'preparing' | 'served') =>
    api.patch<Order>(`/orders/${orderId}/items/${itemId}/kds-status`, { status }),
  bumpKdsOrder: (orderId: string) =>
    api.post<Order>(`/orders/${orderId}/kds-bump`),
  recallKdsOrder: (orderId: string) =>
    api.post<Order>(`/orders/${orderId}/kds-recall`),
  batchBumpKdsItem: (menuItemId: string, variantName?: string) =>
    api.post<{ success: boolean; message: string }>('/orders/kds/batch-bump', { menuItemId, variantName }),
};

export interface KdsPrepTableEntry {
  orderId: string;
  itemId: string;
  tableNumber: string;
  tokenNumber?: number;
  quantity: number;
  status: 'pending' | 'preparing' | 'served' | 'cancelled';
  notes?: string;
  createdAt: string;
  orderedAt?: string;
  effectiveTime?: string;
  roundNumber?: number;
}

export interface KdsPrepNextItem {
  key: string;
  menuItemId: string;
  name: string;
  variantName?: string;
  isVeg: boolean;
  category?: any;
  totalQuantity: number;
  pendingQuantity: number;
  preparingQuantity: number;
  oldestOrderAt: string;
  notes: string[];
  tables: KdsPrepTableEntry[];
}

export interface KdsActiveResponse {
  orders: Order[];
  fulfilled?: Order[];
  prepNext: KdsPrepNextItem[];
}
