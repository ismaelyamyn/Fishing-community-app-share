import type { SupabaseClient } from "@supabase/supabase-js";

// PostgREST returns at most 1000 rows per request, so large tables are read in
// pages. A stable order is required or rows can repeat or go missing between pages.
const PAGE = 1000;

export async function fetchAll<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  orderBy: string,
  configure?: (q: any) => any
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q: any = supabase.from(table).select(columns);
    if (configure) q = configure(q);
    const { data, error } = await q.order(orderBy, { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

export async function upsertChunks(
  supabase: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string
): Promise<void> {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + 500), { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}
