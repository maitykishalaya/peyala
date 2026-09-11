import api from './api';

export interface MenuCategory {
  _id: string;
  name: string;
  description?: string;
  sortOrder: number;
  isActive: boolean;
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
  status: 'pending' | 'preparing' | 'served' | 'cancelled';
}

export interface KotRound {
  _id: string;
  roundNumber: number;
  roundTag?: string;
  items: Array<{
    name: string;
    quantity: number;
    notes?: string;
  }>;
  printed: boolean;
  printedAt?: string | null;
  createdAt?: string;
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
  paymentMethod?: 'cash' | 'card' | 'upi' | 'other' | null;
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
// Tables API
// ─────────────────────────────────────────────────────────────────
export const tablesApi = {
  list: () =>
    api.get<Table[]>('/tables'),
  get: (id: string) =>
    api.get<Table>(`/tables/${id}`),
  create: (data: { tableNumber: string; capacity: number; status?: string }) =>
    api.post<Table>('/tables', data),
  update: (id: string, data: Partial<Table>) =>
    api.put<Table>(`/tables/${id}`, data),
  delete: (id: string) =>
    api.delete<{ message: string }>(`/tables/${id}`),
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
  }>;
}

// ─────────────────────────────────────────────────────────────────
// Orders API
// ─────────────────────────────────────────────────────────────────
export const ordersApi = {
  list: (params?: { status?: string; page?: number; limit?: number }) =>
    api.get<Order[]>('/orders', { params }),
  get: (id: string) =>
    api.get<Order>(`/orders/${id}`),
  getActiveForTable: (tableId: string) =>
    api.get<Order | null>(`/orders/table/${tableId}/active`),
  create: (data: { tableId: string; items: Array<{ menuItemId: string; quantity: number; notes?: string }> }) =>
    api.post<Order>('/orders', data),
  addItems: (id: string, items: Array<{ menuItemId: string; quantity: number; notes?: string }>) =>
    api.post<Order>(`/orders/${id}/items`, { items }),
  updateItem: (id: string, itemId: string, data: { status?: string; quantity?: number; notes?: string }) =>
    api.patch<Order>(`/orders/${id}/items/${itemId}`, data),
  cancelItem: (id: string, itemId: string) =>
    api.delete<Order>(`/orders/${id}/items/${itemId}`),
  applyDiscount: (id: string, data: { discountValue?: number; discountType?: 'flat' | 'percentage'; discount?: number }) =>
    api.patch<Order>(`/orders/${id}/discount`, data),
  bill: (id: string) =>
    api.post<Order>(`/orders/${id}/bill`),
  pay: (id: string, paymentMethod: 'cash' | 'card' | 'upi' | 'other', settlementAmount?: number) =>
    api.post<Order>(`/orders/${id}/pay`, { paymentMethod, settlementAmount }),
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
};
