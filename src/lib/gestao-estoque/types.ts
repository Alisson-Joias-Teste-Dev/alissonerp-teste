export type SchemaName = "public";
export type ViewMode = "grid" | "dashboard" | "inventory";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface TableRow { [key: string]: any }

export interface TableColumn {
  key: string;
  label: string;
  type: string;
}

export interface NotificationState {
  message: string;
  type: "success" | "error" | "info";
  visible: boolean;
}

export interface DashboardTab {
  id: string;
  label: string;
  table: string;
  schema: SchemaName;
}

export interface DashboardProps {
  data: TableRow[];
  tableName: string;
  loading: boolean;
  error?: string | null;
  page?: number;
  totalCount?: number | null;
  onNextPage?: () => void;
  onPrevPage?: () => void;
  onRefresh?: () => void;
  onPromotion?: (selected: TableRow[]) => void;
  schema?: SchemaName;
}

export const DEFAULT_PAGE_SIZE = 50;
export const SCHEMAS = ["public"] as const;
