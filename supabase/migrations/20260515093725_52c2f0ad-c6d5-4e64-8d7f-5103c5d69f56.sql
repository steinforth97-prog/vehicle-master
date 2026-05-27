-- Enums
CREATE TYPE public.motorhome_body_type AS ENUM ('alkoven', 'teilintegriert', 'vollintegriert', 'kastenwagen');
CREATE TYPE public.motorhome_doc_type AS ENUM ('dichtigkeitspruefung', 'verkaufsschild', 'finanzierungsangebot', 'werkstattrechnung', 'verkaufsrechnung', 'verbindliche_bestellung');
CREATE TYPE public.company_kind AS ENUM ('auto', 'wohnmobil');

-- Erweitere company_settings um kind
ALTER TABLE public.company_settings ADD COLUMN kind public.company_kind NOT NULL DEFAULT 'auto';
CREATE UNIQUE INDEX company_settings_kind_idx ON public.company_settings(kind);

-- Lege zweite Firma an (Steinforth Wohnmobile GmbH)
INSERT INTO public.company_settings (kind, company_name, address_street, address_zip, address_city)
VALUES ('wohnmobil', 'Steinforth Wohnmobile GmbH', 'Brenneckestraße 28', '39120', 'Magdeburg')
ON CONFLICT DO NOTHING;

-- motorhomes Tabelle
CREATE TABLE public.motorhomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand text NOT NULL,
  model text NOT NULL,
  year integer,
  first_registration date,
  mileage integer,
  price numeric,
  purchase_price numeric,
  vin text,
  color text,
  fuel public.fuel_type,
  transmission public.transmission_type,
  power_kw integer,
  power_hp integer,
  displacement_cc integer,
  status public.vehicle_status NOT NULL DEFAULT 'verfuegbar',
  notes text,
  features text[] NOT NULL DEFAULT '{}',
  main_image_url text,
  -- Wohnmobil-spezifisch
  body_type public.motorhome_body_type,
  sleeping_places integer,
  sitting_places integer,
  length_mm integer,
  width_mm integer,
  height_mm integer,
  gross_weight_kg integer,
  tech_details jsonb,
  tech_details_updated_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.motorhomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all motorhomes" ON public.motorhomes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER motorhomes_set_updated_at BEFORE UPDATE ON public.motorhomes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- motorhome_images
CREATE TABLE public.motorhome_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  motorhome_id uuid NOT NULL REFERENCES public.motorhomes(id) ON DELETE CASCADE,
  url text NOT NULL,
  storage_path text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.motorhome_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all motorhome_images" ON public.motorhome_images FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- motorhome_documents (hochgeladene PDFs)
CREATE TABLE public.motorhome_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  motorhome_id uuid NOT NULL,
  name text NOT NULL,
  storage_path text NOT NULL,
  url text NOT NULL,
  page_count integer NOT NULL DEFAULT 1,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.motorhome_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all motorhome_documents" ON public.motorhome_documents FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- motorhome_doc_records (generierte Dokumente)
CREATE TABLE public.motorhome_doc_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  motorhome_id uuid REFERENCES public.motorhomes(id) ON DELETE CASCADE,
  type public.motorhome_doc_type NOT NULL,
  document_number text,
  buyer_name text,
  buyer_address text,
  buyer_id_number text,
  total_amount numeric,
  data jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.motorhome_doc_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all motorhome_doc_records" ON public.motorhome_doc_records FOR ALL TO authenticated USING (true) WITH CHECK (true);