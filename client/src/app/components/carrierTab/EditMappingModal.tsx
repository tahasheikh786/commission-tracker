import Modal from "../Modal";
import FieldMapper from "../../upload/components/FieldMapper";
import { useEffect, useState } from "react";
import { STANDARD_FIELDS } from "@/constants/fields";
import toast from "react-hot-toast";

export default function EditMappingModal({ carrier, onClose }: { carrier: any, onClose: () => void }) {
  const [mapping, setMapping] = useState<Record<string, string> | null>(null);
  const [fieldConfig, setFieldConfig] = useState<{ field: string, label: string }[]>(STANDARD_FIELDS);
  const [columns, setColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastStatement, setLastStatement] = useState<any>(null);


  function getLabelFromStandardFields(fieldKey: string) {
    return (STANDARD_FIELDS.find(f => f.field === fieldKey)?.label) || fieldKey;
  }

  // Fetch mapping and column headers
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      // Fetch last statement to get available columns
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/companies/${carrier.id}/statements/`);
      const arr = await res.json();
      const last = arr?.[0];

      // Fetch mapping from backend
      const mapRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/companies/${carrier.id}/mapping/`);
      const mappingObj = await mapRes.json();

      let fallbackColumns: string[] = [];
      if (mappingObj && mappingObj.mapping) {
        fallbackColumns = Object.values(mappingObj.mapping).filter(Boolean) as string[] || [];
      }
      setColumns(last?.raw_data?.[0]?.header && last?.raw_data?.[0]?.header.length > 0
        ? last.raw_data[0].header
        : fallbackColumns
      );

      setLastStatement(last);

      if (mappingObj && mappingObj.mapping) {
        setMapping(mappingObj.mapping);
        setFieldConfig(mappingObj.field_config || STANDARD_FIELDS);
      } else {
        setMapping({});
        setFieldConfig(STANDARD_FIELDS);
      }
      setLoading(false);
    }
    fetchData();
  }, [carrier.id]);

  // Save mapping on FieldMapper save
  async function handleSave(map: Record<string, string>, fieldConf: any[], planTypes: string[]) {
    const config = {
      mapping: map,
      plan_types: planTypes,
      table_names: [], // Table names can be passed in if needed
      field_config: fieldConf,
    };
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/companies/${carrier.id}/mapping/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    if (res.ok) {
      toast.success("Mapping updated!");
      onClose();
    } else {
      toast.error("Failed to update mapping.");
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="w-full max-w-full px-2 md:px-10 py-8">
        <div className="font-bold text-xl mb-6 text-center">
          Edit Mappings for <span className="text-blue-600">{carrier.name}</span>
        </div>
        {loading ? (
          <div className="text-blue-600 text-center py-8 text-lg">Loading...</div>
        ) : (
          <div className="flex flex-col md:flex-row gap-8 items-start">
            <div className="w-full lg:w-1/2 max-w-full">
              <FieldMapper
                company={carrier}
                columns={columns}
                onSave={handleSave}
                onSkip={onClose}
                initialFields={fieldConfig}
                initialMapping={mapping}
              />
            </div>
            <div className="w-full lg:w-1/2 bg-white border rounded-2xl shadow p-4">
              <div className="font-semibold text-blue-700 mb-2">Extracted Table Preview</div>
              {columns && columns.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-[420px] text-sm">
                    <thead>
                      <tr>
                        {columns.map((col, i) => (
                          <th key={i} className="px-2 py-2 border-b font-bold">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {lastStatement?.raw_data?.[0]?.data?.slice?.(0, 6)?.map((row: string[], i: number) => (
                        <tr key={i} className="hover:bg-blue-50">
                          {row.map((cell, j) => (
                            <td key={j} className="px-2 py-2 border-b">{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-gray-400">No sample data</div>
              )}
            </div>
          </div>
        )}
      </div>

    </Modal>
  );
}
