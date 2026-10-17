import { useOutletContext } from 'react-router';
import { EmptyState } from '../../components/States.tsx';
import { CategoriesSection } from './config/CategoriesSection.tsx';
import { EditionsSection } from './config/EditionsSection.tsx';
import { GeneralSettings } from './config/GeneralSettings.tsx';
import { SlotsSection } from './config/SlotsSection.tsx';
import { CONFIG_TABLES } from './config-tables.ts';
import { EditableTable } from './EditableTable.tsx';

export function ConfigPage() {
  const { topicId } = useOutletContext<{ topicId: string }>();
  if (!topicId) return <EmptyState title="Chưa có chủ đề nào đang bật" />;

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="font-serif text-2xl font-bold">Cấu hình</h1>
        <p className="text-sm text-muted">Thay đổi có hiệu lực từ lần chạy kế tiếp, không cần deploy.</p>
      </div>
      <GeneralSettings topicId={topicId} />
      <EditionsSection topicId={topicId} />
      <SlotsSection topicId={topicId} />
      <CategoriesSection topicId={topicId} />
      {CONFIG_TABLES.map((def) => <EditableTable key={def.id} def={def} topicId={topicId} />)}
    </div>
  );
}
