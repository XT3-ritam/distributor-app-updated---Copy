import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { Boxes, ClipboardList, FileSpreadsheet, Home, LogOut, Package, PlusCircle, Settings, Store, Truck, Users, Wallet } from 'lucide-react';

const owner: Array<[string, LucideIcon, string]> = [
  ['/owner', Home, 'Dashboard'],
  ['/owner/orders', ClipboardList, 'Orders & Bills'],
  ['/owner/customers', Store, 'Customers'],
  ['/owner/products', Package, 'Products'],
  ['/owner/inventory', Boxes, 'Stock'],
  ['/owner/supplier', Truck, 'Company Deliveries'],
  ['/owner/payments', Wallet, 'Payments'],
  ['/owner/reports', FileSpreadsheet, 'Reports'],
  ['/owner/staff', Users, 'Staff'],
  ['/owner/settings', Settings, 'Settings']
];

const staff: Array<[string, LucideIcon, string]> = [
  ['/staff', Home, 'Home'],
  ['/staff/order', PlusCircle, 'New Order'],
  ['/staff/orders', ClipboardList, 'My Orders'],
  ['/staff/payments', Wallet, 'Payments']
];

function staffDisplayName() {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null') as { displayName?: string; username?: string } | null;
    return user?.displayName?.trim() || user?.username || 'Staff';
  } catch {
    return 'Staff';
  }
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length > 1
    ? parts.map((part) => part[0]).join('').slice(0, 2).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

export function AppLayout({ role }: { role: 'OWNER' | 'STAFF' }) {
  const nav = useNavigate();
  const items = role === 'OWNER' ? owner : staff;
  const brandName = role === 'OWNER' ? 'Bhowmick Agency' : staffDisplayName();
  const brandInitials = role === 'OWNER' ? 'BA' : initials(brandName);

  function out() {
    localStorage.clear();
    nav('/login');
  }

  return (
    <div className={`app-shell ${role === 'STAFF' ? 'staff-mode' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <span>{brandInitials}</span>
          <div>
            <strong>{brandName}</strong>
            <small>{role === 'OWNER' ? 'Master Web' : 'Staff Mobile'}</small>
          </div>
        </div>
        <nav>
          {items.map(([to, Icon, label]) => (
            <NavLink key={to} to={to} end={to === '/owner' || to === '/staff'}>
              {({ isActive }) => (
                <span className={isActive ? 'active' : ''}>
                  <Icon size={18} />
                  {label}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <button className="logout" onClick={out}>
          <LogOut size={18} />
          Logout
        </button>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <div className="eyebrow">{role === 'OWNER' ? 'MASTER WEB' : 'STAFF APP'}</div>
            <strong>{new Date().toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</strong>
          </div>
          <div className="top-actions">
            <span className="live-dot">Live</span>
          </div>
        </header>
        <section className="content">
          <Outlet />
        </section>
      </main>
    </div>
  );
}
