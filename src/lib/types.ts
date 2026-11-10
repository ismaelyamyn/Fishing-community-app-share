// Row shape of the spots_public view (see phase3.sql)
export type SpotRow = {
  id: string;
  name: string;
  description: string | null;
  depth_m: number | null;
  status: string;
  created_by: string;
  created_by_name: string | null;
  island_id: number | null;
  island_name: string | null;
  lng: number;
  lat: number;
  avg_rating: number;
  review_count: number;
  community_score: number | null;
  species_ids: number[];
  species_names: string[];
  created_at: string;
  updated_at: string;
};

export type Island = { id: number; name: string };
export type Species = { id: number; name_en: string };
