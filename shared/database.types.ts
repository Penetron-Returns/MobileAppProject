/**
 * PLACEHOLDER — WS-A replaces this with the full Supabase-generated shape
 * (`supabase gen types typescript`) matching supabase/migrations.
 * Until then every table/function is loosely typed so code compiles.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type LooseTable = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Row: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Insert: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Update: any;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: Record<string, LooseTable>;
    Views: Record<string, never>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Functions: Record<string, { Args: any; Returns: any }>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
