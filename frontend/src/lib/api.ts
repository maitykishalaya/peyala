import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('peyala_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('peyala_token');
      localStorage.removeItem('peyala_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;

// Auth
export const authApi = {
  login: (email: string, password: string) => api.post('/auth/login', { email, password }),
  logout: () => api.post('/auth/logout'),
  register: (data: any) => api.post('/auth/register', data),
  me: () => api.get('/auth/me'),
  completeWalkthrough: () => api.post('/auth/complete-walkthrough'),
  // User management (admin only)
  listUsers: () => api.get('/auth/users'),
  createUser: (data: any) => api.post('/auth/users', data),
  updateUser: (id: string, data: any) => api.put(`/auth/users/${id}`, data),
  deleteUser: (id: string) => api.delete(`/auth/users/${id}`),
};

// Dashboard
export const dashboardApi = {
  summary: () => api.get('/dashboard/summary'),
};

// Accounts
export const accountsApi = {
  list: () => api.get('/accounts'),
  create: (data: any) => api.post('/accounts', data),
  update: (id: string, data: any) => api.put(`/accounts/${id}`, data),
  delete: (id: string) => api.delete(`/accounts/${id}`),
  getPaymentModes: (id: string) => api.get(`/accounts/${id}/payment-modes`),
  // Returns all transactions (purchases, payments, receipts, transfers, sales) for one account
  getLedger: (id: string, params?: any) => api.get(`/accounts/${id}/ledger`, { params }),
};

// Suppliers
export const suppliersApi = {
  list: () => api.get('/suppliers'),
  get: (id: string) => api.get(`/suppliers/${id}`),
  create: (data: any) => api.post('/suppliers', data),
  update: (id: string, data: any) => api.put(`/suppliers/${id}`, data),
  delete: (id: string) => api.delete(`/suppliers/${id}`),
};

// Inventory
export const inventoryApi = {
  categories: () => api.get('/inventory/categories'),
  createCategory: (data: any) => api.post('/inventory/categories', data),
  updateCategory: (id: string, data: any) => api.put(`/inventory/categories/${id}`, data),
  deleteCategory: (id: string) => api.delete(`/inventory/categories/${id}`),
  items: (params?: any) => api.get('/inventory/items', { params }),
  getItem: (id: string) => api.get(`/inventory/items/${id}`),
  createItem: (data: any) => api.post('/inventory/items', data),
  updateItem: (id: string, data: any) => api.put(`/inventory/items/${id}`, data),
  deleteItem: (id: string) => api.delete(`/inventory/items/${id}`),
};

// Purchases
export const purchasesApi = {
  list: (params?: any) => api.get('/purchases', { params }),
  get: (id: string) => api.get(`/purchases/${id}`),
  create: (data: any) => api.post('/purchases', data),
  update: (id: string, data: any) => api.put(`/purchases/${id}`, data),
  delete: (id: string) => api.delete(`/purchases/${id}`),
  // Clear a previously due purchase — debits account
  clearDue: (id: string, data: any) => api.post(`/purchases/${id}/clear-due`, data),
  // Create an inventory item on the fly while entering a purchase
  quickAddItem: (data: any) => api.post('/purchases/items/quick-add', data),
};

// Payment Categories — editable categories + subcategories
export const categoriesApi = {
  list: () => api.get('/categories'),
  create: (data: any) => api.post('/categories', data),
  update: (id: string, data: any) => api.put(`/categories/${id}`, data),
  delete: (id: string) => api.delete(`/categories/${id}`),
  // Drill-down: all payments for this category/subcategory + total paid
  getLedger: (id: string, params?: any) => api.get(`/categories/${id}/ledger`, { params }),
  addSubcategory: (id: string, name: string) => api.post(`/categories/${id}/subcategories`, { name }),
  deleteSubcategory: (id: string, name: string) => api.delete(`/categories/${id}/subcategories/${encodeURIComponent(name)}`),
};

// Sales
export const salesApi = {
  list: (params?: any) => api.get('/sales', { params }),
  today: () => api.get('/sales/today'),
  create: (data: any) => api.post('/sales', data),
  update: (id: string, data: any) => api.put(`/sales/${id}`, data),
  delete: (id: string) => api.delete(`/sales/${id}`),
};

// Payments
export const paymentsApi = {
  list: (params?: any) => api.get('/payments', { params }),
  create: (data: any) => api.post('/payments', data),
  update: (id: string, data: any) => api.put(`/payments/${id}`, data),
  delete: (id: string) => api.delete(`/payments/${id}`),
};

// Receipts
export const receiptsApi = {
  list: (params?: any) => api.get('/receipts', { params }),
  create: (data: any) => api.post('/receipts', data),
  delete: (id: string) => api.delete(`/receipts/${id}`),
};

// Staff
export const staffApi = {
  list: () => api.get('/staff'),
  get: (id: string) => api.get(`/staff/${id}`),
  create: (data: any) => api.post('/staff', data),
  update: (id: string, data: any) => api.put(`/staff/${id}`, data),
  // Unified pay endpoint — handles salary, advance, bonus
  pay: (id: string, data: any) => api.post(`/staff/${id}/pay`, data),
  // Keep old for backward compatibility
  paySalary: (id: string, data: any) => api.post(`/staff/${id}/pay`, { ...data, paymentType: 'salary' }),
  delete: (id: string) => api.delete(`/staff/${id}`),
};

// Transfers
export const transfersApi = {
  list: () => api.get('/transfers'),
  create: (data: any) => api.post('/transfers', data),
};

// Reports
export const reportsApi = {
  pnl: (startDate: string, endDate: string) => api.get('/reports/pnl', { params: { startDate, endDate } }),
  daily: (date: string) => api.get('/reports/daily', { params: { date } }),
  inventoryPurchases: (startDate: string, endDate: string) => api.get('/reports/inventory-purchases', { params: { startDate, endDate } }),
};

// Audit Log
export const auditApi = {
  list: (params?: any) => api.get('/auditlog', { params }),
};

// Balance Sheet
export const balanceSheetApi = {
  // Fetch full balance sheet with calculated totals
  get: () => api.get('/balancesheet'),
  // Update config (accounts, GST amount, custom liabilities)
  update: (data: any) => api.put('/balancesheet', data),
  // Record a GST payment — resets liability
  payGst: (data: any) => api.post('/balancesheet/pay-gst', data),
};

// Backup & Restore — full database export/import
export const backupApi = {
  // Downloads the full JSON backup as a blob the browser can save
  exportJson: () => api.get('/backup/export', { responseType: 'blob' }),
  // Downloads a single collection as CSV
  exportCsv: (collection: string) => api.get(`/backup/export/csv/${collection}`, { responseType: 'blob' }),
  // Returns document counts per collection (for the picker UI)
  collections: () => api.get('/backup/collections'),
  // Restores from an uploaded JSON backup. mode: 'merge' | 'replace'
  import: (data: any, mode: string, confirmation: string) =>
    api.post('/backup/import', { data, mode, confirmation }),
};

// Owner Note — admin editable notice for staff/manager
export const ownerNoteApi = {
  get: () => api.get('/owner-note'),
  update: (data: any) => api.put('/owner-note', data),
};
