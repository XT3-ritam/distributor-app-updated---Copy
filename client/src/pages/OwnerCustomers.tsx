import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { isAxiosError } from 'axios';
import api from '../services/api';

interface CustomerForm {
  storeName: string;
  address: string;
  phone: string;
  gstin: string;
  state: string;
  stateCode: string;
  pan: string;
  isTaxpayer: boolean;
  creditLimit: number;
  active: boolean;
}

interface Customer {
  id: string;
  store_name: string;
  address: string | null;
  phone: string | null;
  gstin: string | null;
  state: string | null;
  state_code: string | null;
  pan: string | null;
  is_taxpayer: boolean;
  credit_limit: number | string;
  active: boolean;
}

const blank: CustomerForm = {
  storeName: '',
  address: '',
  phone: '',
  gstin: '',
  state: 'West Bengal',
  stateCode: '19',
  pan: '',
  isTaxpayer: false,
  creditLimit: 0,
  active: true
};

function customerForm(customer: Customer): CustomerForm {
  return {
    storeName: customer.store_name,
    address: customer.address ?? '',
    phone: customer.phone ?? '',
    gstin: customer.gstin ?? '',
    state: customer.state ?? '',
    stateCode: customer.state_code ?? '',
    pan: customer.pan ?? '',
    isTaxpayer: customer.is_taxpayer,
    creditLimit: Number(customer.credit_limit),
    active: customer.active
  };
}

function CustomerFields({
  value,
  onChange
}: {
  value: CustomerForm;
  onChange: (value: CustomerForm) => void;
}) {
  const set = (field: keyof CustomerForm, fieldValue: string | number | boolean) => {
    onChange({ ...value, [field]: fieldValue });
  };

  return (
    <>
      <label>
        Store name *
        <input required value={value.storeName} onChange={(e) => set('storeName', e.target.value)} />
      </label>
      <label>
        Phone
        <input value={value.phone} onChange={(e) => set('phone', e.target.value)} />
      </label>
      <label>
        GSTIN
        <input value={value.gstin} onChange={(e) => set('gstin', e.target.value)} />
      </label>
      <label>
        PAN
        <input value={value.pan} onChange={(e) => set('pan', e.target.value)} />
      </label>
      <label>
        State
        <input value={value.state} onChange={(e) => set('state', e.target.value)} />
      </label>
      <label>
        State code
        <input value={value.stateCode} onChange={(e) => set('stateCode', e.target.value)} />
      </label>
      <label className="span-2">
        Address
        <input value={value.address} onChange={(e) => set('address', e.target.value)} />
      </label>
      <label>
        Credit limit (₹)
        <input
          type="number"
          min="0"
          step="0.01"
          value={value.creditLimit}
          onChange={(e) => set('creditLimit', Number(e.target.value))}
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={value.isTaxpayer}
          onChange={(e) => set('isTaxpayer', e.target.checked)}
        />
        Tax payer
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={value.active}
          onChange={(e) => set('active', e.target.checked)}
        />
        Active customer
      </label>
    </>
  );
}

function mutationError(error: unknown, fallback: string) {
  if (isAxiosError(error)) return error.response?.data?.error || error.message;
  return error instanceof Error ? error.message : fallback;
}

export function OwnerCustomers() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [form, setForm] = useState<CustomerForm>({ ...blank });
  const [editing, setEditing] = useState<{ id: string; form: CustomerForm } | null>(null);
  const customers = useQuery({
    queryKey: ['customers', q, 'owner'],
    queryFn: () => api.get('/customers', { params: { q, limit: 100, includeInactive: true } }).then((r) => r.data.items)
  });
  const create = useMutation({
    mutationFn: () => api.post('/customers', form),
    onSuccess: () => {
      setForm({ ...blank });
      qc.invalidateQueries({ queryKey: ['customers'] });
    }
  });
  const update = useMutation({
    mutationFn: () => {
      if (!editing) throw new Error('Select a customer to edit.');
      return api.patch(`/customers/${editing.id}`, editing.form);
    },
    onSuccess: () => {
      setEditing(null);
      qc.invalidateQueries({ queryKey: ['customers'] });
    }
  });
  const changeActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api.patch(`/customers/${id}`, { active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] })
  });

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">MASTER DATA</div>
          <h1>Customers & stores</h1>
          <p className="muted">Add once. Staff can search active stores by name on their phones.</p>
        </div>
      </div>

      <div className="panel">
        <h2>Add new store</h2>
        {create.isError && <div className="alert danger">{mutationError(create.error, 'Could not add customer.')}</div>}
        <form
          className="form-grid"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <CustomerFields value={form} onChange={setForm} />
          <button className="btn primary" disabled={create.isPending}>Add store</button>
        </form>
      </div>

      {editing && (
        <div className="panel">
          <div className="panel-head">
            <h2>Edit customer</h2>
            <button className="btn secondary" type="button" onClick={() => setEditing(null)}>Cancel</button>
          </div>
          {update.isError && <div className="alert danger">{mutationError(update.error, 'Could not update customer.')}</div>}
          <form
            className="form-grid"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              update.mutate();
            }}
          >
            <CustomerFields
              value={editing.form}
              onChange={(nextForm) => setEditing({ ...editing, form: nextForm })}
            />
            <div className="button-row">
              <button className="btn primary" disabled={update.isPending}>
                {update.isPending ? 'Saving…' : 'Save changes'}
              </button>
              <button className="btn secondary" type="button" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <h2>Stores</h2>
          <input
            className="search"
            aria-label="Search stores"
            placeholder="Search store name or phone"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {customers.isError && <div className="alert danger">Could not load customers. Please try again.</div>}
        {changeActive.isError && (
          <div className="alert danger">{mutationError(changeActive.error, 'Could not change customer status.')}</div>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Store</th><th>Phone</th><th>GSTIN</th><th>Tax payer</th><th>State</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {(customers.data || []).map((customer: Customer) => (
                <tr key={customer.id}>
                  <td><b>{customer.store_name}</b></td>
                  <td>{customer.phone || '—'}</td>
                  <td>{customer.gstin || '—'}</td>
                  <td><span className={`pill ${customer.is_taxpayer ? 'success' : 'neutral'}`}>{customer.is_taxpayer ? 'YES' : 'NO'}</span></td>
                  <td>{customer.state || '—'}</td>
                  <td><span className={`pill ${customer.active ? 'success' : 'neutral'}`}>{customer.active ? 'Active' : 'Inactive'}</span></td>
                  <td>
                    <div className="button-row">
                      <button
                        className="btn small secondary"
                        type="button"
                        onClick={() => {
                          update.reset();
                          setEditing({ id: customer.id, form: customerForm(customer) });
                        }}
                      >
                        Edit info
                      </button>
                      <button
                        className="btn small secondary"
                        type="button"
                        disabled={changeActive.isPending}
                        onClick={() => {
                          const active = !customer.active;
                          const action = active ? 'restore' : 'remove';
                          const message = active
                            ? `Restore ${customer.store_name}? It will appear in staff order lists again.`
                            : `Remove ${customer.store_name} from staff order lists? Past invoices and account history will be kept.`;
                          if (window.confirm(message)) changeActive.mutate({ id: customer.id, active });
                        }}
                      >
                        {customer.active ? 'Remove' : 'Restore'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!customers.isLoading && customers.data?.length === 0 && (
                <tr><td colSpan={7} className="muted">No customers found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
