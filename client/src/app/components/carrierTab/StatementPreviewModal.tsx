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
                <div className="p-6 pb-4 border-b border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                            <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">Mapped Table Preview</h2>
                            <p className="text-sm text-slate-600 dark:text-slate-400">Review the processed data for this statement</p>
                        </div>
                    </div>
                </div>
                <div className="flex-1 overflow-hidden px-6 py-6">
                    {transformedTables && transformedTables.length > 0 ? (
                        <div className="h-full overflow-auto bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
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
                            <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">This statement doesn&apos;t have any processed data yet.</p>
                            <div className="bg-slate-100 dark:bg-slate-700 rounded-lg p-4 text-left max-w-md mx-auto">
                                <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mb-2">Debug Information:</p>
                                <p className="text-xs text-slate-500 dark:text-slate-500">
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
