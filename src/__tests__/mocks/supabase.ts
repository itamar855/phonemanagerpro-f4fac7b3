import { vi } from 'vitest';

// ─── Chainable Query Builder Mock ────────────────────────────────────────────
// Simulates Supabase's fluent API: supabase.from("table").select("*").eq("col", val)...

type MockRow = Record<string, any>;

export interface MockQueryResult {
  data: MockRow[] | MockRow | null;
  error: { message: string; code: string } | null;
}

export class MockQueryBuilder {
  private _table: string;
  private _operation: string = '';
  private _filters: Array<{ method: string; col: string; val: any }> = [];
  private _payload: any = null;
  private _result: MockQueryResult = { data: [], error: null };
  private _singleResult = false;

  // Tracks all operations for assertion
  static history: Array<{
    table: string;
    operation: string;
    filters: Array<{ method: string; col: string; val: any }>;
    payload: any;
  }> = [];

  constructor(table: string) {
    this._table = table;
  }

  static clearHistory() {
    MockQueryBuilder.history = [];
  }

  static getInserts(table: string) {
    return MockQueryBuilder.history.filter(
      (h) => h.table === table && h.operation === 'insert'
    );
  }

  static getSelects(table: string) {
    return MockQueryBuilder.history.filter(
      (h) => h.table === table && h.operation === 'select'
    );
  }

  static getUpdates(table: string) {
    return MockQueryBuilder.history.filter(
      (h) => h.table === table && h.operation === 'update'
    );
  }

  static getDeletes(table: string) {
    return MockQueryBuilder.history.filter(
      (h) => h.table === table && h.operation === 'delete'
    );
  }

  // Mock data to be returned
  mockReturn(data: MockRow[] | MockRow | null, error: MockQueryResult['error'] = null) {
    this._result = { data, error };
    return this;
  }

  // ─── Operations ──────────────────────────
  select(columns?: string) {
    this._operation = 'select';
    return this;
  }

  insert(payload: any) {
    this._operation = 'insert';
    this._payload = payload;
    this._record();
    return this;
  }

  update(payload: any) {
    this._operation = 'update';
    this._payload = payload;
    return this;
  }

  delete() {
    this._operation = 'delete';
    return this;
  }

  upsert(payload: any) {
    this._operation = 'upsert';
    this._payload = payload;
    this._record();
    return this;
  }

  // ─── Filters ─────────────────────────────
  eq(col: string, val: any) {
    this._filters.push({ method: 'eq', col, val });
    return this;
  }

  neq(col: string, val: any) {
    this._filters.push({ method: 'neq', col, val });
    return this;
  }

  in(col: string, vals: any[]) {
    this._filters.push({ method: 'in', col, val: vals });
    return this;
  }

  ilike(col: string, val: string) {
    this._filters.push({ method: 'ilike', col, val });
    return this;
  }

  gte(col: string, val: any) {
    this._filters.push({ method: 'gte', col, val });
    return this;
  }

  lte(col: string, val: any) {
    this._filters.push({ method: 'lte', col, val });
    return this;
  }

  gt(col: string, val: any) {
    this._filters.push({ method: 'gt', col, val });
    return this;
  }

  lt(col: string, val: any) {
    this._filters.push({ method: 'lt', col, val });
    return this;
  }

  is(col: string, val: any) {
    this._filters.push({ method: 'is', col, val });
    return this;
  }

  // ─── Modifiers ───────────────────────────
  order(col: string, opts?: { ascending?: boolean }) {
    return this;
  }

  limit(n: number) {
    return this;
  }

  range(from: number, to: number) {
    return this;
  }

  single() {
    this._singleResult = true;
    this._record();
    const d = Array.isArray(this._result.data) ? this._result.data[0] || null : this._result.data;
    return Promise.resolve({ data: d, error: this._result.error });
  }

  maybeSingle() {
    this._singleResult = true;
    this._record();
    const d = Array.isArray(this._result.data) ? this._result.data[0] || null : this._result.data;
    return Promise.resolve({ data: d, error: this._result.error });
  }

  // Terminal — returns the result as a resolved promise (for await)
  then(resolve: (value: MockQueryResult) => any, reject?: (reason: any) => any) {
    this._record();
    return Promise.resolve(this._result).then(resolve, reject);
  }

  private _record() {
    MockQueryBuilder.history.push({
      table: this._table,
      operation: this._operation,
      filters: [...this._filters],
      payload: this._payload,
    });
  }
}

// ─── Mock Supabase Client Factory ────────────────────────────────────────────

// Store per-table mock data configuration
const tableMocks: Map<string, { data: any; error: any }> = new Map();

export function setTableMock(table: string, data: any, error: any = null) {
  tableMocks.set(table, { data, error });
}

export function clearAllMocks() {
  tableMocks.clear();
  MockQueryBuilder.clearHistory();
}

export function createMockSupabaseClient() {
  return {
    from: vi.fn((table: string) => {
      const builder = new MockQueryBuilder(table);
      const mock = tableMocks.get(table);
      if (mock) {
        builder.mockReturn(mock.data, mock.error);
      }
      return builder;
    }),
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: {
            user: {
              id: 'test-user-id',
              app_metadata: { store_id: 'test-store-id' },
            },
          },
        },
      }),
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: {
            id: 'test-user-id',
            app_metadata: { store_id: 'test-store-id' },
          },
        },
      }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ data: { path: 'test/path' }, error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://test.com/file.jpg' } }),
      }),
    },
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    }),
    removeChannel: vi.fn(),
  };
}

// ─── Test Data Factories ─────────────────────────────────────────────────────

export const TEST_STORE_ID = 'c5e9bf6f-0e93-442c-9a6e-4b113766b48f';
export const TEST_USER_ID = '608d0ad0-617c-4e1c-bf4d-8e7a89c3716d';
export const TEST_REGISTER_ID = 'fca16002-2eeb-4594-b8f2-689839d31295';

export function makeProduct(overrides: Partial<MockRow> = {}): MockRow {
  return {
    id: 'prod-001',
    name: 'iPhone 14 Pro',
    brand: 'Apple',
    model: '14 Pro',
    imei: '123456789012345',
    cost_price: 3000,
    sale_price: 4500,
    status: 'in_stock',
    store_id: TEST_STORE_ID,
    created_by: TEST_USER_ID,
    ...overrides,
  };
}

export function makeAccessory(overrides: Partial<MockRow> = {}): MockRow {
  return {
    id: 'acc-001',
    name: 'Película iPhone 14',
    brand: 'Generic',
    category: 'pelicula',
    quantity: 50,
    cost_price: 5,
    sale_price: 25,
    store_id: TEST_STORE_ID,
    created_by: TEST_USER_ID,
    ...overrides,
  };
}

export function makeSale(overrides: Partial<MockRow> = {}): MockRow {
  return {
    id: 'sale-001',
    product_id: 'prod-001',
    store_id: TEST_STORE_ID,
    sale_price: 4500,
    discount: 0,
    payment_cash: 4500,
    payment_card: 0,
    payment_pix: 0,
    has_trade_in: false,
    trade_in_value: null,
    trade_in_product_id: null,
    customer_name: 'João Silva',
    customer_phone: '11999999999',
    customer_cpf: null,
    customer_id: null,
    notes: null,
    commission_percent: 10,
    commission_value: 150,
    warranty_days: 90,
    installments: 1,
    seller_id: TEST_USER_ID,
    created_by: TEST_USER_ID,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

export function makeCashRegister(overrides: Partial<MockRow> = {}): MockRow {
  return {
    id: TEST_REGISTER_ID,
    store_id: TEST_STORE_ID,
    opened_by: TEST_USER_ID,
    opening_amount: 50,
    status: 'open',
    opened_at: new Date().toISOString(),
    closed_at: null,
    closed_by: null,
    closing_amount: null,
    expected_amount: null,
    difference: null,
    ...overrides,
  };
}

export function makeCashEntry(overrides: Partial<MockRow> = {}): MockRow {
  return {
    id: 'entry-001',
    cash_register_id: TEST_REGISTER_ID,
    store_id: TEST_STORE_ID,
    type: 'entrada',
    amount: 100,
    description: 'Venda iPhone 14 Pro',
    payment_method: 'dinheiro',
    confirmed: false,
    created_by: TEST_USER_ID,
    created_at: new Date().toISOString(),
    receipt_url: null,
    reference_key: null,
    ...overrides,
  };
}

export function makeServiceOrder(overrides: Partial<MockRow> = {}): MockRow {
  return {
    id: 'os-001',
    store_id: TEST_STORE_ID,
    customer_name: 'Maria Santos',
    customer_phone: '11988888888',
    device_name: 'iPhone 13',
    device_brand: 'Apple',
    device_model: '13',
    device_imei: '987654321098765',
    problem_description: 'Tela quebrada',
    status: 'pending',
    technician_id: TEST_USER_ID,
    estimated_cost: 350,
    final_cost: null,
    payment_method: null,
    created_by: TEST_USER_ID,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}
