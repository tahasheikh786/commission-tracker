import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { CardLoader } from '@/app/upload/components/Loader';
import { Search, Edit, Trash2, Plus, Filter, ChevronLeft, ChevronRight } from 'lucide-react';

type Carrier = { id: string; name: string };

type Props = {
  carriers: Carrier[];
  selected: Carrier | null;
  onSelect: (c: Carrier) => void;
  loading?: boolean;
  onDelete: (ids: string[]) => void;
  deleting?: boolean;
};

export default function CarrierList({ carriers, selected, onSelect, loading, onDelete, deleting }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCarriers, setSelectedCarriers] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [carriersPerPage] = useState(10);
  const [editingCarrierId, setEditingCarrierId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [updating, setUpdating] = useState(false);

  const sortedCarriers = carriers
    .filter(carrier => carrier.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  const paginatedCarriers = sortedCarriers.slice(
    (currentPage - 1) * carriersPerPage,
    currentPage * carriersPerPage
  );

  const handleCheckboxChange = (id: string) => {
    const newSelectedCarriers = new Set(selectedCarriers);
    if (newSelectedCarriers.has(id)) {
      newSelectedCarriers.delete(id);
    } else {
      newSelectedCarriers.add(id);
    }
    setSelectedCarriers(newSelectedCarriers);
  };

  const handleDelete = () => {
    if (selectedCarriers.size > 0) {
      onDelete(Array.from(selectedCarriers)); 
      setSelectedCarriers(new Set());
    }
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1); // Reset to first page when searching
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const startEdit = (carrier: Carrier) => {
    setEditingCarrierId(carrier.id);
    setEditName(carrier.name);
  };

  const cancelEdit = () => {
    setEditingCarrierId(null);
    setEditName('');
  };

  const saveEdit = async (carrier: Carrier) => {
    if (!editName.trim() || editName === carrier.name) {
      cancelEdit();
      return;
    }
    setUpdating(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/companies/${carrier.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName }),
      });
      if (res.ok) {
        const updated = await res.json();
        // Update local state
        onSelect({ ...carrier, name: updated.name });
        setEditingCarrierId(null);
        setEditName('');
        toast.success('Carrier name updated!');
      } else {
        toast.error('Failed to update carrier name.');
      }
    } catch (e) {
      toast.error('Network error.');
    }
    setUpdating(false);
  };

  return (
    <div className="card p-4 relative w-full">
      {deleting && (
        <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex items-center justify-center z-10 rounded-2xl">
          <div className="flex items-center space-x-3">
            <div className="loading-spinner w-6 h-6"></div>
            <span className="text-gray-700 font-medium">Deleting carriers...</span>
          </div>
        </div>
      )}
      
      {/* Enhanced Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-bold text-gray-800">Carriers</h3>
          <p className="text-sm text-gray-600">
            {carriers.length} total carrier{carriers.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button className="btn btn-primary px-4 py-2">
          <Plus size={16} className="mr-2" />
          Add New
        </button>
      </div>

      {/* Enhanced Search Bar */}
      <div className="relative mb-6">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          placeholder="Search carriers..."
          value={searchQuery}
          onChange={handleSearch}
          className="input pl-10 pr-4 py-3 w-full"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Enhanced Delete Button */}
      {selectedCarriers.size > 0 && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-red-700 font-medium">
              {selectedCarriers.size} carrier{selectedCarriers.size !== 1 ? 's' : ''} selected
            </span>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="btn btn-destructive px-4 py-2"
            >
              <Trash2 size={16} className="mr-2" />
              {deleting ? 'Deleting...' : 'Delete Selected'}
            </button>
          </div>
        </div>
      )}

      {/* Enhanced Carrier List */}
      {loading ? (
        <CardLoader />
      ) : (
        <div className="space-y-2">
          {paginatedCarriers.map((carrier, index) => (
            <div
              key={carrier.id}
              className={`group relative p-3 rounded-xl border transition-all duration-200 ${
                selected?.id === carrier.id
                  ? 'border-primary bg-primary/5 shadow-md'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selectedCarriers.has(carrier.id)}
                  onChange={() => handleCheckboxChange(carrier.id)}
                  disabled={deleting}
                  className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                />
                
                {editingCarrierId === carrier.id ? (
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      className="input py-1 px-2 text-sm flex-1"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      disabled={updating}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit(carrier);
                        if (e.key === 'Escape') cancelEdit();
                      }}
                    />
                    <button
                      className="btn btn-success px-2 py-1 text-xs"
                      onClick={() => saveEdit(carrier)}
                      disabled={updating}
                    >
                      Save
                    </button>
                    <button
                      className="btn btn-ghost px-2 py-1 text-xs"
                      onClick={cancelEdit}
                      disabled={updating}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      className={`flex-1 text-left font-medium transition-colors ${
                        selected?.id === carrier.id ? 'text-primary' : 'text-gray-800'
                      }`}
                      onClick={() => onSelect(carrier)}
                    >
                      {carrier.name}
                    </button>
                    
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                        onClick={() => startEdit(carrier)}
                        disabled={updating}
                        title="Edit name"
                      >
                        <Edit size={14} />
                      </button>
                    </div>
                  </>
                )}
              </div>
              
              {/* Selection indicator */}
              {selected?.id === carrier.id && (
                <div className="absolute top-0 right-0 w-2 h-2 bg-primary rounded-full"></div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Enhanced Pagination */}
      {sortedCarriers.length > carriersPerPage && (
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200">
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="btn btn-ghost px-3 py-2 disabled:opacity-50"
          >
            <ChevronLeft size={16} className="mr-1" />
            Prev
          </button>
          
          <span className="text-sm text-gray-600">
            Page {currentPage} of {Math.ceil(sortedCarriers.length / carriersPerPage)}
          </span>
          
          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === Math.ceil(sortedCarriers.length / carriersPerPage)}
            className="btn btn-ghost px-3 py-2 disabled:opacity-50"
          >
            Next
            <ChevronRight size={16} className="ml-1" />
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && sortedCarriers.length === 0 && (
        <div className="text-center py-8">
          <Search className="mx-auto h-12 w-12 text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-600 mb-2">
            {searchQuery ? 'No carriers found' : 'No carriers yet'}
          </h3>
          <p className="text-gray-500">
            {searchQuery 
              ? 'Try adjusting your search terms' 
              : 'Get started by adding your first carrier'
            }
          </p>
        </div>
      )}
    </div>
  );
}
