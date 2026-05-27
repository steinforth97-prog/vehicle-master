CREATE TYPE public.external_invoice_type AS ENUM (
  'werkstattrechnung',
  'dichtigkeitspruefung',
  'freie_rechnung',
  'kommissionsverkauf'
);

CREATE TABLE public.external_invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type public.external_invoice_type NOT NULL,
  document_number text,
  invoice_date date NOT NULL DEFAULT current_date,
  customer_name text,
  customer_address text,
  vehicle jsonb NOT NULL DEFAULT '{}'::jsonb,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_amount numeric,
  storage_path text,
  url text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_external_invoices_created_at ON public.external_invoices (created_at DESC);
CREATE INDEX idx_external_invoices_type ON public.external_invoices (type);

ALTER TABLE public.external_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth all external_invoices"
  ON public.external_invoices FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

CREATE TRIGGER external_invoices_set_updated_at
  BEFORE UPDATE ON public.external_invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();