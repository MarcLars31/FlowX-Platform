type AutomaticProjectInput = {
  extractedName?: string | null;
  extractedProjectNumber?: string | null;
  extractedStandards?: readonly string[];
  fileName: string;
  now?: Date;
};

export type AutomaticProjectDetails = {
  name: string;
  projectNumber: string | null;
  standard: string;
  systemType: string;
  description: string;
};

/**
 * Produces the minimum project metadata needed after a technical description
 * has been read. Extracted document metadata wins; the uploaded file name is
 * the deterministic fallback so users never have to create an empty project.
 */
export function automaticProjectDetails({
  extractedName,
  extractedProjectNumber,
  extractedStandards = [],
  fileName,
  now = new Date()
}: AutomaticProjectInput): AutomaticProjectDetails {
  const safeFileName = displayFileName(fileName);
  const name =
    cleanText(extractedName, 200) ??
    cleanText(safeFileName, 200) ??
    `Teknisk analys ${formatDate(now)}`;
  const projectNumber = cleanText(extractedProjectNumber, 100);
  const standard =
    extractedStandards.map((value) => cleanText(value, 100)).find(Boolean) ??
    "Fastställs från det tekniska underlaget";

  return {
    name,
    projectNumber,
    standard,
    systemType: "Sprinklersystem – fastställs från underlaget",
    description: `Skapat automatiskt av Scipx från den tekniska beskrivningen ”${safeFileName ?? "uppladdad PDF"}”.`
  };
}

function displayFileName(fileName: string) {
  const withoutPath = fileName.split(/[\\/]/).pop() ?? fileName;
  return withoutPath
    .replace(/\.pdf$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanText(value: string | null | undefined, maxLength: number) {
  const cleaned = value?.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function formatDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
