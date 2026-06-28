import {
  AlertCircle,
  CheckSquare,
  Clock3,
  FolderKanban
} from "lucide-react";
import type { MaterialLine, PipelineStep, Product, Project, Stat } from "@/types";

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
    standard: "NS-EN 12845",
    systemType: "Wet sprinkler system",
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
