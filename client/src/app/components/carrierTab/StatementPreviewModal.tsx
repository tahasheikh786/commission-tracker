import Modal from "../Modal";
import DashboardTable from "../../upload/components/DashboardTable";

type Props = {
    statement: any;
    onClose: () => void;
};

export default function StatementPreviewModal({ statement, onClose }: Props) {
    return (
        <Modal onClose={onClose}>
            <div className="w-full lg:max-w-7xl max-h-[80vh] overflow-auto mx-auto">
                <div className="mb-2 font-semibold">Mapped Table Preview</div>
                {statement.final_data && statement.final_data.length > 0 ? (
                    <DashboardTable
                        tables={statement.final_data}
                        fieldConfig={statement.field_config || []}
                        onEditMapping={() => { }}
                        readOnly
                    />
                ) : (
                    <div className="text-gray-500 py-8 text-center">
                        No mapped data available for this statement.
                    </div>
                )}
            </div>

        </Modal>
    );
}
