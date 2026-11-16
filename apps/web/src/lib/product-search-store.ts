import { isMissingSprsokSearchView } from "./sprsok-search";

const legacyColumns = "id,sin,leverandor,type,utforelse,k_verdi,rti,datablad";
const columns = `${legacyColumns},source,source_id,is_demo,demo_disclaimer`;
const projections = [
  { table: "flowx_product_search_v2", columns: `${columns},product_name,product_category,material,connection_type,available_sizes,technical_data`, legacyIds: false, indexed: true },
  { table: "flowx_product_search", columns, legacyIds: false, indexed: true },
  { table: "sprsok_product_search", columns: legacyColumns, legacyIds: true, indexed: true },
  { table: "sprsok_products", columns: legacyColumns, legacyIds: true, indexed: false }
];

type Parameters = Record<string, string>;
export function createProductSearchStore<T>(database: {
  select: (table: string, params: Parameters) => Promise<T[]>;
  selectWithCount: (table: string, params: Parameters) => Promise<{ rows: T[]; total: number }>;
}) {
  return {
    async selectRows(params: Parameters): Promise<T[]> {
      for (const projection of projections) {
        try {
          if (projection.legacyIds && params.id?.includes("flowx:")) return [];
          // Preserve numeric links from before the unified view was introduced.
          const id = projection.legacyIds ? params.id?.replace(/sprsok:/g, "")
            : params.id?.replace(/^(eq|neq)\.(\d+)$/, "$1.sprsok:$2");
          const rows = await database.select(projection.table, { ...params, ...(id ? { id } : {}), select: projection.columns });
          return projection.legacyIds ? rows.map(row => ({ ...row, source: "sprsok" })) : rows;
        } catch (error) {
          if (!projection.indexed || !isMissingSprsokSearchView(error)) throw error;
        }
      }
      return [];
    },
    async selectWithCount(indexed: Parameters, legacy: Parameters) {
      for (const projection of projections) {
        try {
          const result = await database.selectWithCount(projection.table, {
            ...(projection.indexed ? indexed : legacy), select: projection.columns
          });
          return { ...result, rows: projection.legacyIds ? result.rows.map(row => ({ ...row, source: "sprsok" })) : result.rows };
        } catch (error) {
          if (!projection.indexed || !isMissingSprsokSearchView(error)) throw error;
        }
      }
      return { rows: [] as T[], total: 0 };
    }
  };
}
