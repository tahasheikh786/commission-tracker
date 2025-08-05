import React from 'react';
import { X, Database, FileText } from 'lucide-react';

interface Carrier {
  id: string;
  name: string;
  statement_count: number;
}

interface CarriersModalProps {
  isOpen: boolean;
  onClose: () => void;
  carriers: Carrier[];
  loading?: boolean;
}

export default function CarriersModal({ isOpen, onClose, carriers, loading = false }: CarriersModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Database className="text-blue-600" size={28} />
            <h2 className="text-2xl font-bold text-gray-800">All Carriers</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X size={24} className="text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(80vh-120px)]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-600">Loading carriers...</span>
            </div>
          ) : carriers.length === 0 ? (
            <div className="text-center py-12">
              <Database className="mx-auto text-gray-400" size={48} />
              <p className="text-gray-500 mt-4">No carriers found</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {carriers.map((carrier) => (
                <div
                  key={carrier.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                      <span className="text-blue-600 font-semibold text-sm">
                        {carrier.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-800">{carrier.name}</h3>
                      <p className="text-sm text-gray-500">Carrier ID: {carrier.id}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <FileText className="text-gray-400" size={20} />
                    <span className="font-semibold text-gray-800">
                      {carrier.statement_count} statement{carrier.statement_count !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Total: {carriers.length} carrier{carriers.length !== 1 ? 's' : ''}
            </p>
            <button
              onClick={onClose}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 