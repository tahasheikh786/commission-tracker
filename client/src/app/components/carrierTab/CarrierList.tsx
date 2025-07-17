import React, { useState, useEffect } from 'react';

type Carrier = { id: string; name: string };

type Props = {
  carriers: Carrier[];
  selected: Carrier | null;
  onSelect: (c: Carrier) => void;
  loading?: boolean;
  onDelete: (ids: string[]) => void;
};

export default function CarrierList({ carriers, selected, onSelect, loading, onDelete }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCarriers, setSelectedCarriers] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [carriersPerPage] = useState(15);

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
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  return (
    <div className="md:w-1/4 w-full bg-white/80 rounded-2xl shadow p-5">
      <div className="flex justify-between items-center mb-3">
        <div className="relative w-full">
          <input
            type="text"
            placeholder="Search carriers"
            value={searchQuery}
            onChange={handleSearch}
            className="w-full p-3 rounded-lg border border-gray-300 focus:border-blue-500 focus:outline-none pl-10"
          />
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500"
            width="16"
            height="16"
            fill="currentColor"
            viewBox="0 0 16 16"
          >
            <path d="M11.742 10.742a6 6 0 1 0-1.416 1.416l3.478 3.478a1 1 0 1 0 1.416-1.416l-3.478-3.478zM12 6a5 5 0 1 1-10 0 5 5 0 0 1 10 0z" />
          </svg>
        </div>
        {selectedCarriers.size > 0 && (
          <button
            onClick={handleDelete}
            className="px-4 py-2 bg-red-600 text-white rounded font-semibold hover:bg-red-700 transition"
          >
            Delete Selected
          </button>
        )}
      </div>
      {loading ? (
        <div className="flex justify-center items-center">Loading...</div>
      ) : (
        <ul>
          {paginatedCarriers.map(carrier => (
            <li key={carrier.id} className="flex items-center mb-2">
              <input
                type="checkbox"
                checked={selectedCarriers.has(carrier.id)}
                onChange={() => handleCheckboxChange(carrier.id)}
                className="mr-2"
              />
              <button
                className={`block w-full text-left px-4 py-2 rounded-lg transition
                  ${selected?.id === carrier.id ? "bg-blue-100 font-bold text-blue-700" : "hover:bg-gray-100"}`}
                onClick={() => onSelect(carrier)}
              >
                {carrier.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Pagination */}
      <div className="flex justify-between items-center mt-4">
        <button
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300"
        >
          Prev
        </button>
        <span>
          Page {currentPage} of {Math.ceil(sortedCarriers.length / carriersPerPage)}
        </span>
        <button
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage === Math.ceil(sortedCarriers.length / carriersPerPage)}
          className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300"
        >
          Next
        </button>
      </div>
    </div>
  );
}
