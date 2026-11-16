import { notFound } from 'next/navigation';
import { ProjectReports } from '@/components/ProjectReports';
import { isUuid } from '@/lib/distributor-product-mapping';
export default async function ProjectReportsPage({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;if(!isUuid(id))notFound();
  return <ProjectReports projectId={id}/>;
}
