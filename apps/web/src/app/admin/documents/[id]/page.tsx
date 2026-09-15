import { ProductDocumentReview } from "@/components/ProductDocumentReview";

export default async function ProductDocumentReviewPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProductDocumentReview documentId={id} />;
}
