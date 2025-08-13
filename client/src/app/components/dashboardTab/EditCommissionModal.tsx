'use client'
import React, { useState, useEffect } from 'react';
import { X, Save, DollarSign, Building2, TrendingUp } from 'lucide-react';

interface CommissionData {
  id: string;
  carrier_name?: string;
  client_name: string;
  invoice_total: number;
  commission_earned: number;
  statement_count: number;
  last_updated?: string;
  created_at?: string;
}

interface EditCommissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: CommissionData | null;
  onSave: (updatedData: Partial<CommissionData>) => Promise<void>;
  loading?: boolean;
}

export default function EditCommissionModal({ 
  isOpen, 
  onClose, 
  data, 
  onSave, 
  loading = false 
}: EditCommissionModalProps) {
  const [formData, setFormData] = useState({
    client_name: '',
    invoice_total: '',
    commission_earned: ''
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (data) {
      setFormData({
        client_name: data.client_name || '',
        invoice_total: data.invoice_total?.toString() || '',
        commission_earned: data.commission_earned?.toString() || ''
      });
      setErrors({});
    }
  }, [data]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.client_name.trim()) {
      newErrors.client_name = 'Company name is required';
    }

    const invoiceTotal = parseFloat(formData.invoice_total.replace(/[$,]/g, ''));
    if (isNaN(invoiceTotal) || invoiceTotal < 0) {
      newErrors.invoice_total = 'Please enter a valid invoice amount';
    }

    const commissionEarned = parseFloat(formData.commission_earned.replace(/[$,]/g, ''));
    if (isNaN(commissionEarned) || commissionEarned < 0) {
      newErrors.commission_earned = 'Please enter a valid commission amount';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    try {
      const invoiceTotal = parseFloat(formData.invoice_total.replace(/[$,]/g, ''));
      const commissionEarned = parseFloat(formData.commission_earned.replace(/[$,]/g, ''));

      await onSave({
        id: data?.id || '',
        client_name: formData.client_name.trim(),
        invoice_total: invoiceTotal,
        commission_earned: commissionEarned
      });

      onClose();
    } catch (error) {
      console.error('Error saving commission data:', error);
    }
  };

  const formatCurrencyInput = (value: string) => {
    // Remove all non-numeric characters except decimal point
    const numericValue = value.replace(/[^0-9.]/g, '');
    
    // Ensure only one decimal point
    const parts = numericValue.split('.');
    if (parts.length > 2) {
      return parts[0] + '.' + parts.slice(1).join('');
    }
    
    return numericValue;
  };

  const formatCurrencyDisplay = (value: string) => {
    if (!value) return '';
    const numericValue = parseFloat(value);
    if (isNaN(numericValue)) return value;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numericValue);
  };

  if (!isOpen || !data) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
              <TrendingUp className="text-green-600" size={20} />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-800">Edit Commission Data</h2>
              <p className="text-sm text-gray-600">Update company and commission information</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <div className="p-6 space-y-6">
          {/* Company Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Building2 className="inline mr-2" size={16} />
              Company Name
            </label>
            <input
              type="text"
              value={formData.client_name}
              onChange={(e) => handleInputChange('client_name', e.target.value)}
              className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors ${
                errors.client_name ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="Enter company name"
            />
            {errors.client_name && (
              <p className="mt-1 text-sm text-red-600">{errors.client_name}</p>
            )}
          </div>

          {/* Invoice Total */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <DollarSign className="inline mr-2" size={16} />
              Invoice Total
            </label>
            <input
              type="text"
              value={formData.invoice_total}
              onChange={(e) => handleInputChange('invoice_total', formatCurrencyInput(e.target.value))}
              className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors ${
                errors.invoice_total ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="0.00"
            />
            {formData.invoice_total && (
              <p className="mt-1 text-sm text-gray-500">
                {formatCurrencyDisplay(formData.invoice_total)}
              </p>
            )}
            {errors.invoice_total && (
              <p className="mt-1 text-sm text-red-600">{errors.invoice_total}</p>
            )}
          </div>

          {/* Commission Earned */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <TrendingUp className="inline mr-2" size={16} />
              Commission Earned
            </label>
            <input
              type="text"
              value={formData.commission_earned}
              onChange={(e) => handleInputChange('commission_earned', formatCurrencyInput(e.target.value))}
              className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors ${
                errors.commission_earned ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="0.00"
            />
            {formData.commission_earned && (
              <p className="mt-1 text-sm text-gray-500">
                {formatCurrencyDisplay(formData.commission_earned)}
              </p>
            )}
            {errors.commission_earned && (
              <p className="mt-1 text-sm text-red-600">{errors.commission_earned}</p>
            )}
          </div>

          {/* Read-only Info */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Statements:</span>
              <span className="font-medium">{data.statement_count}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Last Updated:</span>
              <span className="font-medium">
                {data.last_updated ? new Date(data.last_updated).toLocaleDateString() : 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Saving...
              </>
            ) : (
              <>
                <Save size={16} />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
