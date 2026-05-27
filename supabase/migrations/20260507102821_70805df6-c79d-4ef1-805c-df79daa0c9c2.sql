
CREATE TABLE public.vehicle_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL,
  name text NOT NULL,
  storage_path text NOT NULL,
  url text NOT NULL,
  page_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
ALTER TABLE public.vehicle_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all vehicle_documents" ON public.vehicle_documents
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_vehicle_documents_vehicle_id ON public.vehicle_documents(vehicle_id);

INSERT INTO storage.buckets (id, name, public) VALUES ('vehicle-documents', 'vehicle-documents', true)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "vehicle-documents public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'vehicle-documents');

CREATE POLICY "vehicle-documents auth insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vehicle-documents');

CREATE POLICY "vehicle-documents auth update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'vehicle-documents');

CREATE POLICY "vehicle-documents auth delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'vehicle-documents');
