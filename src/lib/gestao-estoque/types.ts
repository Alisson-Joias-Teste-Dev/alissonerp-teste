export type SchemaName = "public";
export type ViewMode = "grid" | "dashboard" | "inventory";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface TableRow { [key: string]: any }

export interface DashboardProps {
  data: TableRow[];
  tableName: string;
  loading: boolean;
  error?: string | null;
  onRefresh?: () => void;
  onPromotion?: (selected: TableRow[]) => void;
}

export const DEFAULT_PAGE_SIZE = 50;
