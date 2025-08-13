import Modal from "../Modal";
import DashboardTable from "../../upload/components/DashboardTable";

type Props = {
    statement: any;
    onClose: () => void;
};

export default function StatementPreviewModal({ statement, onClose }: Props) {
    // Debug logging to help identify the issue
    console.log('StatementPreviewModal received statement:', {
        id: statement.id,
        hasFinalData: !!statement.final_data,
        finalDataLength: statement.final_data?.length,
        hasFieldConfig: !!statement.field_config,
        fieldConfigLength: statement.field_config?.length,
        fieldConfig: statement.field_config
    });

    return (
        <Modal onClose={onClose}>
            <div className="w-full h-full flex flex-col">
                <div className="p-6 pb-2">
                    <div className="font-semibold text-lg">Mapped Table Preview</div>
                </div>
                <div className="flex-1 overflow-hidden px-6 pb-6">
                    {statement.final_data && statement.final_data.length > 0 ? (
                        <div className="h-full overflow-auto">
                            <DashboardTable
                                tables={statement.final_data}
                                fieldConfig={statement.field_config || []}
                                onEditMapping={() => { }}
                                readOnly
                            />
                        </div>
                    ) : (
                        <div className="text-gray-500 py-8 text-center">
                            No mapped data available for this statement.
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
}
