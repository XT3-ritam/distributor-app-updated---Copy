import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { Upload, CheckCircle2, AlertCircle } from 'lucide-react';

export function SupplierDelivery() {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [stagedInvoice, setStagedInvoice] = useState<any>(null);

  const uploadMutation = useMutation({
    mutationFn: (formData: FormData) => api.post('/supplier/upload', formData),
    onSuccess: (res) => setStagedInvoice(res.data)
  });

  const approveMutation = useMutation({
    mutationFn: () => api.post('/supplier/approve', {
      stagingId: stagedInvoice.id,
      items: stagedInvoice.extracted_data.items.map((i: any) => ({
        productId: i.matchedSku, // Note: In a real app, this would be a product UUID matched by SKU
        quantity: i.quantity
      }))
    }),
    onSuccess: () => {
      alert('Inventory updated!');
      setStagedInvoice(null);
      queryClient.invalidateQueries({ queryKey: ['products'] });
    }
  });

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">AI Supplier Invoice Processing</h1>
      
      {!stagedInvoice ? (
        <div className="p-12 border-4 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center bg-white">
          <Upload className="w-16 h-16 text-gray-300 mb-4" />
          <p className="text-gray-500 mb-6">Upload supplier invoice (PDF or Image)</p>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="mb-4"
          />
          <button
            onClick={() => {
              if (!file) return;
              const fd = new FormData();
              fd.append('invoice', file);
              uploadMutation.mutate(fd);
            }}
            disabled={!file || uploadMutation.isPending}
            className="bg-blue-600 text-white px-8 py-3 rounded-lg font-bold hover:bg-blue-700 disabled:bg-gray-300"
          >
            {uploadMutation.isPending ? 'Processing with Gemini AI...' : 'Upload & Extract'}
          </button>
        </div>
      ) : (
        <div className="bg-white shadow-xl rounded-xl p-8 border border-blue-100">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-xl font-bold">Review Extracted Data</h2>
            <span className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-sm font-bold">
              AI MATCHED - OWNER REVIEW REQUIRED
            </span>
          </div>

          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <p className="text-sm text-gray-500 uppercase font-bold">Supplier</p>
              <p className="text-lg font-medium">{stagedInvoice.supplier_name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 uppercase font-bold">Total Amount</p>
              <p className="text-lg font-medium">${stagedInvoice.total_amount}</p>
            </div>
          </div>

          <table className="w-full mb-8">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left">Description</th>
                <th className="px-4 py-2 text-center">Qty</th>
                <th className="px-4 py-2 text-right">Unit Cost</th>
                <th className="px-4 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {stagedInvoice.extracted_data.items.map((item: any, idx: number) => (
                <tr key={idx} className="border-b">
                  <td className="px-4 py-3">
                    {item.rawDescription}
                    {item.matchedSku && (
                      <span className="ml-2 text-xs text-green-600 font-bold flex items-center">
                        <CheckCircle2 className="w-3 h-3 mr-1" /> SKU Matched: {item.matchedSku}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center font-bold">{item.quantity}</td>
                  <td className="px-4 py-3 text-right">${item.unitCost}</td>
                  <td className="px-4 py-3 text-right">${item.totalCost}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex gap-4">
            <button
              onClick={() => approveMutation.mutate()}
              className="flex-1 bg-green-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-green-700"
            >
              Confirm & Update Inventory
            </button>
            <button
              onClick={() => setStagedInvoice(null)}
              className="px-8 py-4 border rounded-xl font-bold hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
