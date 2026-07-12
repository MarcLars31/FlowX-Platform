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

export const demoExtractedLineCategoryCounts = {
  Pipe: 72,
  Fitting: 31,
  Valve: 18,
  Sprinkler: 12,
  Equipment: 7
};

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
    category: "Sprinkler",
    requirement: "Sprinkler head QR K80 68°C DN15",
    extracted: "Standard Spray, K=80, 68°C",
    matchedProduct: "Ahlsell QR K80 standard spray DN15",
    product_id: "sprinkler-qr-k80-pendent",
    compatibleProducts: ["Ahlsell", "Victaulic", "Viking"],
    postNumber: "1403.33.333.1.1",
    sourcePage: 3,
    documentHref: "/projects/demo/upload?postnr=1403.33.333.1.1",
    sourceReference: "Page 3, post 1403.33.333.1.1",
    compliance: "NFPA 13, FM/UL listed",
    confidence: 97,
    selectedProduct: "Ahlsell QR K80 standard spray DN15",
    status: "Verified"
  },
  {
    id: "grooved-pipe-dn80",
    category: "Pipe",
    requirement: "Grooved pipe DN80",
    extracted: "Powder coated grooved pipe, DN80",
    matchedProduct: "Ahlsell powder coated grooved pipe DN80",
    product_id: "pipe-dn80",
    compatibleProducts: ["Ahlsell", "Victaulic", "Onninen"],
    postNumber: "1403.33.332.1.2",
    sourcePage: 2,
    documentHref: "/projects/demo/upload?postnr=1403.33.332.1.2",
    sourceReference: "Page 2, post 1403.33.332.1.2",
    compliance: "12 bar, grooved joint",
    confidence: 95,
    selectedProduct: "Ahlsell powder coated grooved pipe DN80",
    status: "Verified"
  },
  {
    id: "grooved-pipe-dn100",
    category: "Pipe",
    requirement: "Grooved pipe DN100",
    extracted: "Powder coated grooved pipe, DN100",
    matchedProduct: "Ahlsell powder coated grooved pipe DN100",
    product_id: "pipe-dn100",
    compatibleProducts: ["Ahlsell", "Victaulic", "Onninen"],
    postNumber: "1403.33.332.1.1",
    sourcePage: 2,
    documentHref: "/projects/demo/upload?postnr=1403.33.332.1.1",
    sourceReference: "Page 2, post 1403.33.332.1.1",
    compliance: "12 bar, grooved joint",
    confidence: 96,
    selectedProduct: "Ahlsell powder coated grooved pipe DN100",
    status: "Verified"
  },
  {
    id: "grooved-pipe-dn65",
    category: "Pipe",
    requirement: "Grooved pipe DN65",
    extracted: "Powder coated grooved pipe, DN65",
    matchedProduct: "Ahlsell powder coated grooved pipe DN65",
    product_id: "pipe-dn65",
    compatibleProducts: ["Ahlsell", "Victaulic", "Onninen"],
    postNumber: "1403.33.332.1.3",
    sourcePage: 2,
    documentHref: "/projects/demo/upload?postnr=1403.33.332.1.3",
    sourceReference: "Page 2, post 1403.33.332.1.3",
    compliance: "12 bar, grooved joint",
    confidence: 95,
    selectedProduct: "Ahlsell powder coated grooved pipe DN65",
    status: "Verified"
  },
  {
    id: "grooved-pipe-dn50",
    category: "Pipe",
    requirement: "Grooved pipe DN50",
    extracted: "Powder coated grooved pipe, DN50",
    matchedProduct: "Ahlsell powder coated grooved pipe DN50",
    product_id: "pipe-dn50",
    compatibleProducts: ["Ahlsell", "Victaulic", "Onninen"],
    postNumber: "1403.33.332.1.4",
    sourcePage: 2,
    documentHref: "/projects/demo/upload?postnr=1403.33.332.1.4",
    sourceReference: "Page 2, post 1403.33.332.1.4",
    compliance: "12 bar, grooved joint",
    confidence: 94,
    selectedProduct: "Ahlsell powder coated grooved pipe DN50",
    status: "Verified"
  },
  {
    id: "grooved-bend-dn32",
    category: "Fitting",
    requirement: "Grooved bend DN32",
    extracted: "Grooved bend fitting, DN32",
    matchedProduct: "Ahlsell grooved bend DN32",
    product_id: "bend-dn32",
    compatibleProducts: ["Victaulic", "Ahlsell"],
    postNumber: "1403.33.332.2.1",
    sourcePage: 2,
    documentHref: "/projects/demo/upload?postnr=1403.33.332.2.1",
    sourceReference: "Page 2, post 1403.33.332.2.1",
    compliance: "12 bar, sprinkler approved",
    confidence: 93,
    selectedProduct: "Ahlsell grooved bend DN32",
    status: "Verified"
  },
  {
    id: "butterfly-valve-dn65",
    category: "Valve",
    requirement: "Monitored butterfly valve DN65",
    extracted: "Zone valve with monitoring, DN65",
    matchedProduct: "Ahlsell monitored butterfly valve DN65",
    product_id: "monitored-valve-dn65",
    compatibleProducts: ["Ahlsell", "Tyco", "Victaulic"],
    postNumber: "1403.33.334.1.2",
    sourcePage: 3,
    documentHref: "/projects/demo/upload?postnr=1403.33.334.1.2",
    sourceReference: "Page 3, post 1403.33.334.1.2",
    compliance: "sprinkler zone valve",
    confidence: 91,
    selectedProduct: "Ahlsell monitored butterfly valve DN65",
    status: "Verified"
  },
  {
    id: "flow-switch",
    category: "Equipment",
    requirement: "Flow switch",
    extracted: "Strømningsvakt",
    matchedProduct: "Ahlsell sprinkler flow switch",
    product_id: "flow-switch",
    compatibleProducts: ["Ahlsell", "Tyco", "Viking"],
    postNumber: "1403.33.335.1.1",
    sourcePage: 3,
    documentHref: "/projects/demo/upload?postnr=1403.33.335.1.1",
    sourceReference: "Page 3, post 1403.33.335.1.1",
    compliance: "Fire alarm interface required",
    confidence: 88,
    selectedProduct: "Ahlsell sprinkler flow switch",
    status: "Verified"
  }
];

export const demoMaterialLines: DemoMaterialLine[] = [
  {
    line: 1,
    category: "Pipe",
    productCategory: "Pipe",
    requirement: "Powder coated grooved pipe DN100",
    selectedProduct: "Ahlsell powder coated grooved pipe DN100",
    supplier: "Ahlsell",
    quantity: 29.16,
    unit: "m",
    confidence: 96,
    notes: "12 bar grooved sprinkler pipe",
    postNumber: "1403.33.332.1.1",
    dimension: "DN100",
    product_id: "pipe-dn100",
    matchedProduct: "Ahlsell powder coated grooved pipe DN100"
  },
  {
    line: 2,
    category: "Pipe",
    productCategory: "Pipe",
    requirement: "Powder coated grooved pipe DN80",
    selectedProduct: "Ahlsell powder coated grooved pipe DN80",
    supplier: "Ahlsell",
    quantity: 72.78,
    unit: "m",
    confidence: 95,
    notes: "Detected from pipe schedule",
    postNumber: "1403.33.332.1.2",
    dimension: "DN80",
    product_id: "pipe-dn80",
    matchedProduct: "Ahlsell powder coated grooved pipe DN80"
  },
  {
    line: 3,
    category: "Pipe",
    productCategory: "Pipe",
    requirement: "Powder coated grooved pipe DN65",
    selectedProduct: "Ahlsell powder coated grooved pipe DN65",
    supplier: "Ahlsell",
    quantity: 57.32,
    unit: "m",
    confidence: 95,
    notes: "Zone valve branch dimensions",
    postNumber: "1403.33.332.1.3",
    dimension: "DN65",
    product_id: "pipe-dn65",
    matchedProduct: "Ahlsell powder coated grooved pipe DN65"
  },
  {
    line: 4,
    category: "Pipe",
    productCategory: "Pipe",
    requirement: "Powder coated grooved pipe DN50",
    selectedProduct: "Ahlsell powder coated grooved pipe DN50",
    supplier: "Ahlsell",
    quantity: 496.46,
    unit: "m",
    confidence: 94,
    notes: "Main distribution and branch pipe",
    postNumber: "1403.33.332.1.4",
    dimension: "DN50",
    product_id: "pipe-dn50",
    matchedProduct: "Ahlsell powder coated grooved pipe DN50"
  },
  {
    line: 5,
    category: "Pipe",
    productCategory: "Pipe",
    requirement: "Powder coated grooved pipe DN40",
    selectedProduct: "Ahlsell powder coated grooved pipe DN40",
    supplier: "Ahlsell",
    quantity: 223.83,
    unit: "m",
    confidence: 94,
    notes: "Detected from sprinkler branch schedule",
    postNumber: "1403.33.332.1.5",
    dimension: "DN40",
    missing_from_database: true
  },
  {
    line: 6,
    category: "Pipe",
    productCategory: "Pipe",
    requirement: "Powder coated grooved pipe DN32",
    selectedProduct: "Ahlsell powder coated grooved pipe DN32",
    supplier: "Ahlsell",
    quantity: 910.05,
    unit: "m",
    confidence: 93,
    notes: "Largest detected branch quantity",
    postNumber: "1403.33.332.1.6",
    dimension: "DN32",
    missing_from_database: true
  },
  {
    line: 7,
    category: "Pipe",
    productCategory: "Pipe",
    requirement: "Powder coated grooved pipe DN25",
    selectedProduct: "Ahlsell powder coated grooved pipe DN25",
    supplier: "Ahlsell",
    quantity: 54.75,
    unit: "m",
    confidence: 92,
    notes: "Terminal branch pipe",
    postNumber: "1403.33.332.1.7",
    dimension: "DN25",
    missing_from_database: true
  },
  {
    line: 8,
    category: "Fitting",
    productCategory: "Fittings",
    requirement: "Grooved bend DN32",
    selectedProduct: "Ahlsell grooved bend DN32",
    supplier: "Ahlsell",
    quantity: 188,
    unit: "pcs",
    confidence: 91,
    notes: "Equivalent Victaulic alternative available",
    postNumber: "1403.33.332.2.1",
    dimension: "DN32",
    product_id: "bend-dn32",
    matchedProduct: "Ahlsell grooved bend DN32"
  },
  {
    line: 9,
    category: "Fitting",
    productCategory: "Fittings",
    requirement: "Grooved bend DN25",
    selectedProduct: "Ahlsell grooved bend DN25",
    supplier: "Ahlsell",
    quantity: 127,
    unit: "pcs",
    confidence: 91,
    notes: "Missing database product for dimension and joint type",
    postNumber: "1403.33.332.2.2",
    dimension: "DN25",
    missing_from_database: true
  },
  {
    line: 10,
    category: "Equipment",
    productCategory: "Sprinkler connection",
    requirement: "Flexible sprinkler hose DN25",
    selectedProduct: "Ahlsell flexible sprinkler hose DN25",
    supplier: "Ahlsell",
    quantity: 386,
    unit: "pcs",
    confidence: 89,
    notes: "Max equivalent length 15 m",
    postNumber: "1403.33.332.3.1",
    dimension: "DN25",
    missing_from_database: true
  },
  {
    line: 11,
    category: "Sprinkler",
    productCategory: "Sprinkler heads",
    requirement: "QR K80 68°C sprinkler head DN15",
    selectedProduct: "Ahlsell QR K80 standard spray DN15",
    supplier: "Ahlsell",
    quantity: 306,
    unit: "pcs",
    confidence: 97,
    notes: "NFPA 13, FM/UL listed",
    postNumber: "1403.33.333.1.1",
    product_id: "sprinkler-qr-k80-pendent",
    matchedProduct: "Ahlsell QR K80 standard spray DN15"
  },
  {
    line: 12,
    category: "Sprinkler",
    productCategory: "Sprinkler heads",
    requirement: "QR K80 upright sprinkler head",
    selectedProduct: "Viking QR K80 upright sprinkler head",
    supplier: "Viking",
    quantity: 220,
    unit: "pcs",
    confidence: 94,
    notes: "Missing upright sprinkler database match",
    postNumber: "1403.33.333.1.2",
    missing_from_database: true
  },
  {
    line: 13,
    category: "Sprinkler",
    productCategory: "Sprinkler heads",
    requirement: "QR K80 pendent sprinkler head",
    selectedProduct: "Ahlsell QR K80 pendent sprinkler head",
    supplier: "Ahlsell",
    quantity: 118,
    unit: "pcs",
    confidence: 94,
    notes: "Missing pendent sprinkler database match",
    postNumber: "1403.33.333.1.3",
    missing_from_database: true
  },
  {
    line: 14,
    category: "Valve",
    productCategory: "Valves",
    requirement: "Drain valve DN32",
    selectedProduct: "Ahlsell drain valve DN32",
    supplier: "Ahlsell",
    quantity: 9,
    unit: "pcs",
    confidence: 90,
    notes: "Review location before ordering",
    postNumber: "1403.33.334.1.1",
    dimension: "DN32",
    missing_from_database: true
  },
  {
    line: 15,
    category: "Valve",
    productCategory: "Valves",
    requirement: "Monitored butterfly valve DN65",
    selectedProduct: "Ahlsell monitored butterfly valve DN65",
    supplier: "Ahlsell",
    quantity: 5,
    unit: "pcs",
    confidence: 91,
    notes: "Sprinkler zone valve",
    postNumber: "1403.33.334.1.2",
    dimension: "DN65",
    product_id: "monitored-valve-dn65",
    matchedProduct: "Ahlsell monitored butterfly valve DN65"
  },
  {
    line: 16,
    category: "Valve",
    productCategory: "Valves",
    requirement: "Check valve DN65",
    selectedProduct: "Victaulic check valve DN65",
    supplier: "Victaulic",
    quantity: 5,
    unit: "pcs",
    confidence: 90,
    notes: "Missing check valve database match",
    postNumber: "1403.33.334.1.3",
    dimension: "DN65",
    missing_from_database: true
  },
  {
    line: 17,
    category: "Equipment",
    productCategory: "Monitoring",
    requirement: "Flow switch",
    selectedProduct: "Ahlsell sprinkler flow switch",
    supplier: "Ahlsell",
    quantity: 6,
    unit: "pcs",
    confidence: 88,
    notes: "Coordinate with fire alarm interface",
    postNumber: "1403.33.335.1.1",
    product_id: "flow-switch",
    matchedProduct: "Ahlsell sprinkler flow switch"
  },
  {
    line: 18,
    category: "Equipment",
    productCategory: "Monitoring",
    requirement: "I/O unit for flow switch",
    selectedProduct: "Ahlsell I/O unit for flow switch",
    supplier: "Ahlsell",
    quantity: 6,
    unit: "pcs",
    confidence: 88,
    notes: "Accessory for monitored flow switch",
    postNumber: "1403.33.335.1.2",
    missing_from_database: true
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
