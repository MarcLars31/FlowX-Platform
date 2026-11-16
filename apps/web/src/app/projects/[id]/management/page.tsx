import { notFound } from 'next/navigation';
import { ProjectManagementBoard } from '@/components/ProjectManagementBoard';
import { isUuid } from '@/lib/distributor-product-mapping';
export default async function ProjectManagementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  return <ProjectManagementBoard projectId={id} />;
}
