export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      saved_recipes: {
        Row: {
          id: string;
          visitor_id: string;
          title: string;
          source: string;
          original_servings: number | null;
          target_servings: number | null;
          target_unit: string;
          target_temperature_unit: "C" | "F";
          recipe_json: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          visitor_id: string;
          title: string;
          source?: string;
          original_servings?: number | null;
          target_servings?: number | null;
          target_unit: string;
          target_temperature_unit?: "C" | "F";
          recipe_json: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          visitor_id?: string;
          title?: string;
          source?: string;
          original_servings?: number | null;
          target_servings?: number | null;
          target_unit?: string;
          target_temperature_unit?: "C" | "F";
          recipe_json?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};