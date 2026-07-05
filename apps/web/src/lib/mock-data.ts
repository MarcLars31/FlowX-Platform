import {
  AlertCircle,
  CheckSquare,
  Clock3,
  FolderKanban
} from "lucide-react";
import type {
  DemoMaterialLine,
  DemoSummaryItem,
  MaterialLine,
  PipelineStep,
  Product,
  ProductResolutionRow,
  Project,
  Stat
} from "@/types";

export const stats: Stat[] = [
  {
    label: "Active Projects",
    value: "18",
    delta: "+4 this month",
    tone: "blue",
    icon: FolderKanban
  },
  {
    label: "Material Lists Generated",
    value: "126",
    delta: "32 awaiting export",
    tone: "teal",
    icon: CheckSquare
  },
  {
    label: "Estimated Hours Saved",
    value: "412",
    delta: "Based on workflow logs",
    tone: "amber",
    icon: Clock3
  },
  {
    label: "Open Issues",
    value: "7",
    delta: "2 require review",
    tone: "rose",
    icon: AlertCircle
  }
];

export const recentProjects: Project[] = [
  {
    id: "demo",
    name: "Oslo Health Campus",
    customer: "Nordbygg Eiendom",
    address: "Sognsveien 80, Oslo",
    country: "Norway",
    standard: "NFPA 13 / NFPA 14",
    systemType:
      "Wet sprinkler system, deluge facade system, dry riser/fire department connection",
    supplier: "Ahlsell",
    status: "Validation",
    updatedAt: "Today 09:30",
    progress: 68
  },
  {
    id: "p-1042",
    name: "Gothenburg Logistics Hub",
    customer: "Westport Terminal AB",
    address: "Arendalsvagen 42, Gothenburg",
    country: "Sweden",
    standard: "SS-EN 12845",
    systemType: "ESFR sprinkler system",
    supplier: "Dahl",
    status: "Design",
    updatedAt: "Yesterday 16:10",
    progress: 44
  },
  {
    id: "p-1038",
    name: "Aarhus Cold Storage",
    customer: "ScanFoods",
    address: "Havnevej 11, Aarhus",
    country: "Denmark",
    standard: "DBI 251",
    systemType: "Dry sprinkler system",
    supplier: "Broedrene Dahl",
    status: "Procurement",
    updatedAt: "Jun 24, 2026",
    progress: 86
  },
  {
    id: "p-1029",
    name: "Bergen Retail Centre",
    customer: "Fjord Retail",
    address: "Strandgaten 18, Bergen",
    country: "Norway",
    standard: "NS-EN 12845",
    systemType: "Wet sprinkler system",
    supplier: "Ahlsell",
    status: "Issue",
    updatedAt: "Jun 21, 2026",
    progress: 52
  }
];

export const demoProjectProfile = {
  project: "Oslo Health Campus",
  customer: "Nordbygg Eiendom",
  standard: "NFPA 13 / NFPA 14",
  preferredSupplier: "Ahlsell",
  fileName: "1403 AB - 33 Brannslokking.pdf",
  status: "Review ready",
  supplierStrategy: "Ahlsell preferred, equivalents allowed",
  confidenceScore: "94%"
};

export const demoFlowPages = [
  { label: "Upload", href: "/projects/demo/upload" },
  { label: "Analysis", href: "/projects/demo/analysis" },
  { label: "Products", href: "/projects/demo/product-resolution" },
  { label: "Material List", href: "/projects/demo/material-list" }
];

export const pipelineSteps: PipelineStep[] = [
  {
    name: "Validation",
    status: "completed",
    detail: "Project inputs and standard selection checked."
  },
  {
    name: "Knowledge Resolution",
    status: "completed",
    detail: "Applicable requirements matched to the project profile."
  },
  {
    name: "Rule Execution",
    status: "completed",
    detail: "Engineering rules prepared for the selected system type."
  },
  {
    name: "Calculation",
    status: "ready",
    detail: "Hydraulic assumptions are ready for review."
  },
  {
    name: "Product Resolution",
    status: "ready",
    detail: "Supplier catalog compatibility is available."
  },
  {
    name: "Material List",
    status: "ready",
    detail: "Awaiting generation from verified results."
  },
  {
    name: "Document Generation",
    status: "ready",
    detail: "Export templates are prepared."
  }
];

export const demoAnalysisPipelineSteps: PipelineStep[] = [
  {
    name: "Reading document",
    status: "completed",
    detail: "Imported the technical specification structure and file metadata."
  },
  {
    name: "Finding headings",
    status: "completed",
    detail: "Located fire extinguishing, pipework and sprinkler requirement sections."
  },
  {
    name: "Identifying systems",
    status: "completed",
    detail: "Mapped wet sprinkler, deluge facade and dry riser systems."
  },
  {
    name: "Extracting quantities",
    status: "completed",
    detail: "Detected pipe lengths, fittings, valves, flow switches and sprinkler heads."
  },
  {
    name: "Detecting standards",
    status: "completed",
    detail: "Recognized NFPA 13 and NFPA 14 references in the project text."
  },
  {
    name: "Matching product requirements",
    status: "completed",
    detail: "Compared dimensions, pressure rating, material and approval needs."
  },
  {
    name: "Preparing review",
    status: "completed",
    detail: "Prepared supplier alternatives and engineering questions for approval."
  }
];

export const demoAnalysisSummary: DemoSummaryItem[] = [
  {
    label: "Detected systems",
    value:
      "Wet sprinkler system, deluge facade system, dry riser/fire department connection"
  },
  { label: "Standards detected", value: "NFPA 13, NFPA 14" },
  {
    label: "Pipe material",
    value: "Powder coated steel, galvanized steel, PP-R Red Pipe"
  },
  { label: "Pressure", value: "12 bar" },
  { label: "Sprinkler heads", value: "QR K80 68°C and QR K115 68°C" },
  { label: "Preferred supplier", value: "Ahlsell" },
  { label: "Confidence score", value: "94%" }
];

export const demoReviewQuestions = [
  "Confirm preferred supplier: Ahlsell / Onninen / Victaulic",
  "Prioritize lowest price or shortest lead time?",
  "Allow equivalent products?"
];

export const materialLines: MaterialLine[] = [
  {
    line: 1,
    articleNumber: "AH-80120",
    product: "Sprinkler head K80",
    supplier: "Ahlsell",
    quantity: 128,
    unit: "pcs",
    notes: "Standard response, pendent"
  },
  {
    line: 2,
    articleNumber: "AH-DN25-60",
    product: "Pipe DN25",
    supplier: "Ahlsell",
    quantity: 420,
    unit: "m",
    notes: "Galvanized steel"
  },
  {
    line: 3,
    articleNumber: "AH-CPL-25",
    product: "Pipe coupling",
    supplier: "Ahlsell",
    quantity: 186,
    unit: "pcs",
    notes: "DN25 grooved"
  },
  {
    line: 4,
    articleNumber: "AH-VS-100",
    product: "Valve set",
    supplier: "Ahlsell",
    quantity: 4,
    unit: "sets",
    notes: "Alarm valve assembly"
  },
  {
    line: 5,
    articleNumber: "AH-BR-25",
    product: "Bracket",
    supplier: "Ahlsell",
    quantity: 214,
    unit: "pcs",
    notes: "Ceiling mount"
  },
  {
    line: 6,
    articleNumber: "AH-SEAL-25",
    product: "Seal",
    supplier: "Ahlsell",
    quantity: 196,
    unit: "pcs",
    notes: "EPDM seal"
  }
];

export const demoProductResolutionRows: ProductResolutionRow[] = [
  {
    id: "qr-k80-dn15",
    requirement: "Sprinkler head QR K80 68°C DN15",
    extracted: "Standard Spray, K=80, 68°C",
    compatibleProducts: ["Ahlsell", "Victaulic", "Viking"],
    compliance: "NFPA 13, FM/UL listed",
    confidence: 97,
    selectedProduct: "Ahlsell QR K80 standard spray DN15"
  },
  {
    id: "qr-k115-dn20",
    requirement: "Sprinkler head QR K115 68°C DN20",
    extracted: "Quick Response, K=115, 68°C",
    compatibleProducts: ["Ahlsell", "Viking", "Tyco"],
    compliance: "NFPA 13, FM/UL listed",
    confidence: 95,
    selectedProduct: "Ahlsell QR K115 standard spray DN20"
  },
  {
    id: "grooved-pipe-dn100",
    requirement: "Grooved pipe DN100",
    extracted: "Powder coated grooved pipe, DN100",
    compatibleProducts: ["Ahlsell", "Victaulic", "Onninen"],
    compliance: "12 bar, grooved joint",
    confidence: 96,
    selectedProduct: "Ahlsell powder coated grooved pipe DN100"
  },
  {
    id: "grooved-coupling-dn65",
    requirement: "Grooved coupling DN65",
    extracted: "Grooved joint fitting, DN65",
    compatibleProducts: ["Victaulic", "Ahlsell"],
    compliance: "12 bar, sprinkler approved",
    confidence: 93,
    selectedProduct: "Victaulic Style 009N coupling DN65"
  },
  {
    id: "butterfly-valve-dn65",
    requirement: "Monitored butterfly valve DN65",
    extracted: "Zone valve with monitoring, DN65",
    compatibleProducts: ["Ahlsell", "Tyco", "Victaulic"],
    compliance: "sprinkler zone valve",
    confidence: 91,
    selectedProduct: "Ahlsell monitored butterfly valve DN65"
  },
  {
    id: "flex-hose-dn25",
    requirement: "Flexible sprinkler hose DN25",
    extracted: "Flexible sprinkler connection, DN25",
    compatibleProducts: ["Ahlsell", "Victaulic", "FlexHead"],
    compliance: "max equivalent length 15 m",
    confidence: 89,
    selectedProduct: "Ahlsell flexible sprinkler hose DN25"
  }
];

export const demoMaterialLines: DemoMaterialLine[] = [
  {
    line: 1,
    productCategory: "Pipe",
    requirement: "Powder coated grooved pipe DN100",
    selectedProduct: "Ahlsell powder coated grooved pipe DN100",
    supplier: "Ahlsell",
    quantity: 29.16,
    unit: "m",
    confidence: 96,
    notes: "12 bar grooved sprinkler pipe"
  },
  {
    line: 2,
    productCategory: "Pipe",
    requirement: "Powder coated grooved pipe DN80",
    selectedProduct: "Ahlsell powder coated grooved pipe DN80",
    supplier: "Ahlsell",
    quantity: 72.78,
    unit: "m",
    confidence: 95,
    notes: "Detected from pipe schedule"
  },
  {
    line: 3,
    productCategory: "Pipe",
    requirement: "Powder coated grooved pipe DN65",
    selectedProduct: "Ahlsell powder coated grooved pipe DN65",
    supplier: "Ahlsell",
    quantity: 57.32,
    unit: "m",
    confidence: 95,
    notes: "Zone valve branch dimensions"
  },
  {
    line: 4,
    productCategory: "Pipe",
    requirement: "Powder coated grooved pipe DN50",
    selectedProduct: "Ahlsell powder coated grooved pipe DN50",
    supplier: "Ahlsell",
    quantity: 496.46,
    unit: "m",
    confidence: 94,
    notes: "Main distribution and branch pipe"
  },
  {
    line: 5,
    productCategory: "Pipe",
    requirement: "Powder coated grooved pipe DN40",
    selectedProduct: "Ahlsell powder coated grooved pipe DN40",
    supplier: "Ahlsell",
    quantity: 223.83,
    unit: "m",
    confidence: 94,
    notes: "Detected from sprinkler branch schedule"
  },
  {
    line: 6,
    productCategory: "Pipe",
    requirement: "Powder coated grooved pipe DN32",
    selectedProduct: "Ahlsell powder coated grooved pipe DN32",
    supplier: "Ahlsell",
    quantity: 910.05,
    unit: "m",
    confidence: 93,
    notes: "Largest detected branch quantity"
  },
  {
    line: 7,
    productCategory: "Pipe",
    requirement: "Powder coated grooved pipe DN25",
    selectedProduct: "Ahlsell powder coated grooved pipe DN25",
    supplier: "Ahlsell",
    quantity: 54.75,
    unit: "m",
    confidence: 92,
    notes: "Terminal branch pipe"
  },
  {
    line: 8,
    productCategory: "Fittings",
    requirement: "Grooved bend DN32",
    selectedProduct: "Ahlsell grooved bend DN32",
    supplier: "Ahlsell",
    quantity: 188,
    unit: "pcs",
    confidence: 91,
    notes: "Equivalent Victaulic alternative available"
  },
  {
    line: 9,
    productCategory: "Fittings",
    requirement: "Grooved bend DN25",
    selectedProduct: "Ahlsell grooved bend DN25",
    supplier: "Ahlsell",
    quantity: 127,
    unit: "pcs",
    confidence: 91,
    notes: "Matched by dimension and joint type"
  },
  {
    line: 10,
    productCategory: "Sprinkler connection",
    requirement: "Flexible sprinkler hose DN25",
    selectedProduct: "Ahlsell flexible sprinkler hose DN25",
    supplier: "Ahlsell",
    quantity: 386,
    unit: "pcs",
    confidence: 89,
    notes: "Max equivalent length 15 m"
  },
  {
    line: 11,
    productCategory: "Sprinkler heads",
    requirement: "QR K80 68°C sprinkler head DN15",
    selectedProduct: "Ahlsell QR K80 standard spray DN15",
    supplier: "Ahlsell",
    quantity: 306,
    unit: "pcs",
    confidence: 97,
    notes: "NFPA 13, FM/UL listed"
  },
  {
    line: 12,
    productCategory: "Sprinkler heads",
    requirement: "QR K80 upright sprinkler head",
    selectedProduct: "Viking QR K80 upright sprinkler head",
    supplier: "Viking",
    quantity: 220,
    unit: "pcs",
    confidence: 94,
    notes: "Equivalent product selected"
  },
  {
    line: 13,
    productCategory: "Sprinkler heads",
    requirement: "QR K80 pendent sprinkler head",
    selectedProduct: "Ahlsell QR K80 pendent sprinkler head",
    supplier: "Ahlsell",
    quantity: 118,
    unit: "pcs",
    confidence: 94,
    notes: "Matched to ceiling mounted areas"
  },
  {
    line: 14,
    productCategory: "Valves",
    requirement: "Drain valve DN32",
    selectedProduct: "Ahlsell drain valve DN32",
    supplier: "Ahlsell",
    quantity: 9,
    unit: "pcs",
    confidence: 90,
    notes: "Review location before ordering"
  },
  {
    line: 15,
    productCategory: "Valves",
    requirement: "Monitored butterfly valve DN65",
    selectedProduct: "Ahlsell monitored butterfly valve DN65",
    supplier: "Ahlsell",
    quantity: 5,
    unit: "pcs",
    confidence: 91,
    notes: "Sprinkler zone valve"
  },
  {
    line: 16,
    productCategory: "Valves",
    requirement: "Check valve DN65",
    selectedProduct: "Victaulic check valve DN65",
    supplier: "Victaulic",
    quantity: 5,
    unit: "pcs",
    confidence: 90,
    notes: "Compatible equivalent selected"
  },
  {
    line: 17,
    productCategory: "Monitoring",
    requirement: "Flow switch",
    selectedProduct: "Ahlsell sprinkler flow switch",
    supplier: "Ahlsell",
    quantity: 6,
    unit: "pcs",
    confidence: 88,
    notes: "Coordinate with fire alarm interface"
  },
  {
    line: 18,
    productCategory: "Monitoring",
    requirement: "I/O unit for flow switch",
    selectedProduct: "Ahlsell I/O unit for flow switch",
    supplier: "Ahlsell",
    quantity: 6,
    unit: "pcs",
    confidence: 88,
    notes: "Accessory for monitored flow switch"
  }
];

export const products: Product[] = [
  {
    id: "prod-1",
    articleNumber: "AH-80120",
    name: "Sprinkler head K80",
    supplier: "Ahlsell",
    category: "Sprinklers",
    dimension: "K80",
    status: "Preferred",
    compatibility: "Wet systems, LH/OH hazard classes",
    leadTime: "2 days"
  },
  {
    id: "prod-2",
    articleNumber: "DA-DN25-60",
    name: "Pipe DN25",
    supplier: "Dahl",
    category: "Pipe",
    dimension: "DN25",
    status: "Verified",
    compatibility: "EN 10255 threaded pipe",
    leadTime: "1 day"
  },
  {
    id: "prod-3",
    articleNumber: "BD-CPL-25",
    name: "Pipe coupling",
    supplier: "Broedrene Dahl",
    category: "Fittings",
    dimension: "DN25",
    status: "Verified",
    compatibility: "Grooved sprinkler pipe",
    leadTime: "3 days"
  },
  {
    id: "prod-4",
    articleNumber: "AH-VS-100",
    name: "Valve set",
    supplier: "Ahlsell",
    category: "Valves",
    dimension: "DN100",
    status: "Review",
    compatibility: "Requires project pressure check",
    leadTime: "5 days"
  },
  {
    id: "prod-5",
    articleNumber: "DA-BR-25",
    name: "Bracket",
    supplier: "Dahl",
    category: "Supports",
    dimension: "DN25",
    status: "Preferred",
    compatibility: "Ceiling mount, light industrial",
    leadTime: "1 day"
  },
  {
    id: "prod-6",
    articleNumber: "AH-SEAL-25",
    name: "Seal",
    supplier: "Ahlsell",
    category: "Fittings",
    dimension: "DN25",
    status: "Verified",
    compatibility: "EPDM sprinkler seal",
    leadTime: "2 days"
  }
];
