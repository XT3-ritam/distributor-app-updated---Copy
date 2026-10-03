import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { SyncService } from '../services/syncService';
import { ShoppingCart, Plus, Minus, Trash2 } from 'lucide-react';

export function POS() {
  const queryClient = useQueryClient();
  const [cart, setCart] = useState<any[]>([]);
  const [error, setError] = useState('');

  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.get('/products').then(res => res.data)
  });

  const addToCart = (product: any) => {
    const existing = cart.find(i => i.id === product.id);
    const currentQty = existing ? existing.quantity : 0;

    if (product.stock_quantity <= currentQty) {
      setError(`Insufficient stock. Only ${product.stock_quantity} units are currently available.`);
      return;
    }

    if (existing) {
      setCart(cart.map(i => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setCart([...cart, { ...product, quantity: 1 }]);
    }
    setError('');
  };

  const finalizeMutation = useMutation({
    mutationFn: async (order: any) => {
      if (!navigator.onLine) {
        await SyncService.saveOfflineOrder(order);
        return { offline: true };
      }
      return api.post('/orders/finalize', order);
    },
    onSuccess: (res: any) => {
      setCart([]);
      queryClient.invalidateQueries({ queryKey: ['products'] });
      if (res.offline) {
        alert('You are offline. Order saved locally and will sync when reconnected.');
      } else {
        alert('Order completed successfully!');
      }
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || 'Order failed');
    }
  });

  const total = cart.reduce((sum, i) => sum + i.quantity * i.price, 0);

  return (
    <div className="grid grid-cols-3 gap-8">
      <div className="col-span-2">
        <h1 className="text-2xl font-bold mb-6">Select Products</h1>
        <div className="grid grid-cols-2 gap-4">
          {products?.map((p: any) => (
            <div key={p.id} className="p-4 bg-white border rounded-lg shadow-sm">
              <h3 className="font-bold">{p.name}</h3>
              <p className="text-sm text-gray-500">Stock: {p.stock_quantity}</p>
              <p className="font-bold text-blue-600 mt-2">${p.price}</p>
              <button
                disabled={p.stock_quantity === 0}
                onClick={() => addToCart(p)}
                className="mt-3 w-full flex items-center justify-center bg-blue-600 text-white p-2 rounded disabled:bg-gray-300"
              >
                <Plus className="w-4 h-4 mr-2" /> Add to Order
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-white border rounded-lg shadow-md p-6 h-fit sticky top-8">
        <div className="flex items-center mb-6">
          <ShoppingCart className="w-6 h-6 mr-3 text-blue-600" />
          <h2 className="text-xl font-bold">Current Order</h2>
        </div>
        {error && <div className="p-3 bg-red-100 text-red-700 text-sm rounded mb-4">{error}</div>}
        <div className="space-y-4 mb-6 max-h-96 overflow-auto">
          {cart.map(item => (
            <div key={item.id} className="flex justify-between items-center border-b pb-2">
              <div>
                <p className="font-medium">{item.name}</p>
                <p className="text-xs text-gray-500">x{item.quantity} - ${item.price * item.quantity}</p>
              </div>
              <button onClick={() => setCart(cart.filter(i => i.id !== item.id))} className="text-red-500">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {cart.length === 0 && <p className="text-gray-400 text-center py-4">Order is empty</p>}
        </div>
        <div className="border-t pt-4">
          <div className="flex justify-between font-bold text-xl mb-6">
            <span>Total</span>
            <span>${total.toFixed(2)}</span>
          </div>
          <button
            onClick={() => finalizeMutation.mutate({ items: cart.map(i => ({ productId: i.id, quantity: i.quantity, unitPrice: i.price })) })}
            disabled={cart.length === 0 || finalizeMutation.isPending}
            className="w-full bg-green-600 text-white p-3 rounded-lg font-bold hover:bg-green-700 disabled:bg-gray-300"
          >
            {finalizeMutation.isPending ? 'Processing...' : 'Complete Sale'}
          </button>
        </div>
      </div>
    </div>
  );
}
