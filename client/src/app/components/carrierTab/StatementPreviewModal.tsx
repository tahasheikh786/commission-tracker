import Modal from "../Modal";
import DashboardTable from "../../upload/components/DashboardTable";

type Props = {
    statement: any;
    onClose: () => void;
};

export default function StatementPreviewModal({ statement, onClose }: Props) {
  

    // Transform final_data to the format expected by DashboardTable
    const transformTables = (finalData: any[]) => {
        if (!finalData || !Array.isArray(finalData)) {
            console.log('No final_data or not an array');
            return [];
        }

        return finalData.map((table, index) => {
            // Check if table has the expected structure
            if (table && typeof table === 'object') {
                // If it has header and rows, use as-is (without name to avoid "Unnamed Table" heading)
                if (table.header && table.rows) {
                    return {
                        header: table.header,
                        rows: table.rows
                        // Don't include name to avoid table heading
                    };
                }
                
                // If it's an array of objects (mapped data), convert to table format
                if (Array.isArray(table) && table.length > 0 && typeof table[0] === 'object') {
                    const firstRow = table[0];
                    const headers = Object.keys(firstRow);
                    const rows = table.map(row => headers.map(header => row[header] || ''));
                    
                    return {
                        header: headers,
                        rows: rows
                        // Don't include name to avoid table heading
                    };
                }
            }
            
            console.log('Unexpected table format:', table);
            return null;
        }).filter((table): table is { header: string[]; rows: string[][] } => table !== null);
    };

    const transformedTables = transformTables(statement.final_data);
    console.log('Transformed tables:', transformedTables);

    return (
        <Modal onClose={onClose}>
            <div className="w-full h-full flex flex-col overflow-hidden">
                {/* Just the table content - no headers or sections */}
                <div className="flex-1 overflow-hidden">
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
                        <div className="text-center py-16">
                            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-xl flex items-center justify-center mx-auto mb-4">
                                <svg className="w-8 h-8 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">No mapped data available</h3>
                            <p className="text-slate-500 dark:text-slate-400 text-sm">This statement doesn&apos;t have any processed data yet.</p>
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
}
