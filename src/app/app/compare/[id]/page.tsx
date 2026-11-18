import { CompareView } from '@/components/app/CompareView';

export default async function ComparePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CompareView id={id} />;
}
