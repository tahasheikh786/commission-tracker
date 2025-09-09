import Modal from "../Modal";
import DashboardTable from "../../upload/components/DashboardTable";

type Props = {
    statement: any;
    onClose: () => void;
};

export default function StatementPreviewModal({ statement, onClose }: Props) {
    console.log('StatementPreviewModal - statement:', statement);
    console.log('StatementPreviewModal - final_data:', statement.final_data);
    console.log('StatementPreviewModal - field_config:', statement.field_config);

    // Transform final_data to the format expected by DashboardTable
    const transformTables = (finalData: any[]) => {
        if (!finalData || !Array.isArray(finalData)) {
            console.log('No final_data or not an array');
            return [];
        }

        return finalData.map((table, index) => {
            // Check if table has the expected structure
            if (table && typeof table === 'object') {
                // If it has header and rows, use as-is
                if (table.header && table.rows) {
                    return {
                        header: table.header,
                        rows: table.rows,
                        name: table.name || `Table ${index + 1}`
                    };
                }
                
                // If it's an array of objects (mapped data), convert to table format
                if (Array.isArray(table) && table.length > 0 && typeof table[0] === 'object') {
                    const firstRow = table[0];
                    const headers = Object.keys(firstRow);
                    const rows = table.map(row => headers.map(header => row[header] || ''));
                    
                    return {
                        header: headers,
                        rows: rows,
                        name: `Table ${index + 1}`
                    };
                }
            }
            
            console.log('Unexpected table format:', table);
            return null;
        }).filter((table): table is { header: string[]; rows: string[][]; name: string } => table !== null);
    };

    const transformedTables = transformTables(statement.final_data);
    console.log('Transformed tables:', transformedTables);

    return (
        <Modal onClose={onClose}>
            <div className="w-full h-full flex flex-col">
                <div className="p-6 pb-2">
                    <div className="font-semibold text-lg">Mapped Table Preview</div>
                </div>
                <div className="flex-1 overflow-hidden px-6 pb-6">
                    {transformedTables && transformedTables.length > 0 ? (
                        <div className="h-full overflow-auto">
                            <DashboardTable
                                tables={transformedTables}
                                fieldConfig={statement.field_config || []}
                                onEditMapping={() => { }}
                                readOnly
                            />
                        </div>
                    ) : (
                        <div className="text-gray-500 py-8 text-center">
                            <div className="mb-4">
                                <p>No mapped data available for this statement.</p>
                                <p className="text-sm mt-2">Debug info:</p>
                                <p className="text-xs text-gray-400">
                                    Final data type: {typeof statement.final_data}<br/>
                                    Final data length: {statement.final_data?.length || 0}<br/>
                                    Transformed tables length: {transformedTables.length}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
}
