export const MAX_TECHNICAL_DESCRIPTION_BYTES = 30 * 1024 * 1024;

export type TechnicalDescriptionUploadOwner = {
  organizationId: string;
  userId: string;
};

export function validateTechnicalDescriptionFile(input: {
  name: unknown;
  size: unknown;
  type: unknown;
}) {
  if (
    typeof input.name !== "string" ||
    !input.name.toLowerCase().endsWith(".pdf") ||
    input.name.length > 255 ||
    (input.type !== "" && input.type !== "application/pdf")
  ) return "Filen må være en PDF med et filnavn på maksimalt 255 tegn.";
  if (typeof input.size !== "number" || !Number.isSafeInteger(input.size) || input.size <= 0) {
    return "PDF-filen er tom eller har en ugyldig størrelse.";
  }
  if (input.size > MAX_TECHNICAL_DESCRIPTION_BYTES) {
    return "PDF-filen får være maksimalt 30 MB.";
  }
  return null;
}

export function technicalDescriptionUploadPath(
  owner: TechnicalDescriptionUploadOwner,
  uploadId: unknown
) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (
    typeof uploadId !== "string" || !uuid.test(uploadId) ||
    !uuid.test(owner.organizationId) || !uuid.test(owner.userId)
  ) throw new Error("Ugyldig opplastings-id.");

  // The non-UUID second segment keeps staging outside the project-files RLS
  // paths. Only the server can read it, after deriving both owners from auth.
  return `${owner.organizationId}/technical-description-uploads/${owner.userId}/${uploadId}.pdf`;
}
