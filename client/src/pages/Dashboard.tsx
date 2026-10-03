import { Outlet, Link, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Package, ShoppingCart, Truck, LogOut, CloudLightning } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SyncService } from '../services/syncService';

export function Dashboard() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      SyncService.syncOrders();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (navigator.onLine) SyncService.syncOrders();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const logout = () => {
    localStorage.clear();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-64 bg-white border-r">
        <div className="p-6">
          <h2 className="text-xl font-bold text-blue-600">Distributor Pro</h2>
          <p className="text-sm text-gray-500 mt-1">Role: {user.role}</p>
          {!isOnline && (
            <div className="mt-2 flex items-center text-orange-600 text-xs font-bold bg-orange-50 p-2 rounded">
              <CloudLightning className="w-3 h-3 mr-1" /> OFFLINE MODE
            </div>
          )}
        </div>
        <nav className="mt-4">
          <Link to="/" className="flex items-center px-6 py-3 text-gray-700 hover:bg-blue-50 hover:text-blue-600">
            <Package className="w-5 h-5 mr-3" /> Inventory
          </Link>
          <Link to="/pos" className="flex items-center px-6 py-3 text-gray-700 hover:bg-blue-50 hover:text-blue-600">
            <ShoppingCart className="w-5 h-5 mr-3" /> Create Order (POS)
          </Link>
          {user.role === 'OWNER' && (
            <Link to="/supplier" className="flex items-center px-6 py-3 text-gray-700 hover:bg-blue-50 hover:text-blue-600">
              <Truck className="w-5 h-5 mr-3" /> Supplier Delivery
            </Link>
          )}
          <button
            onClick={logout}
            className="w-full flex items-center px-6 py-3 text-red-600 hover:bg-red-50 mt-auto"
          >
            <LogOut className="w-5 h-5 mr-3" /> Logout
          </button>
        </nav>
      </aside>
      <main className="flex-1 overflow-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
