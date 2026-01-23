-- Row Level Security Policies for Karibu Health
-- Demo MVP: Single doctor accessing their own clinic's data

-- Enable RLS on all tables
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE audio_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE magic_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_logs ENABLE ROW LEVEL SECURITY;

-- Helper function to get current staff's clinic_id from JWT
CREATE OR REPLACE FUNCTION get_current_clinic_id()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT clinic_id FROM staff
    WHERE clerk_user_id = auth.jwt()->>'sub'
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to get current staff_id from JWT
CREATE OR REPLACE FUNCTION get_current_staff_id()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT id FROM staff
    WHERE clerk_user_id = auth.jwt()->>'sub'
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Clinics: Staff can view their own clinic
CREATE POLICY "Staff can view own clinic" ON clinics
  FOR SELECT USING (id = get_current_clinic_id());

-- Staff: Can view colleagues at same clinic
CREATE POLICY "Staff can view clinic staff" ON staff
  FOR SELECT USING (clinic_id = get_current_clinic_id());

-- Patients: Staff can CRUD patients at their clinic
CREATE POLICY "Staff can view clinic patients" ON patients
  FOR SELECT USING (clinic_id = get_current_clinic_id());

CREATE POLICY "Staff can create clinic patients" ON patients
  FOR INSERT WITH CHECK (clinic_id = get_current_clinic_id());

CREATE POLICY "Staff can update clinic patients" ON patients
  FOR UPDATE USING (clinic_id = get_current_clinic_id());

-- Visits: Staff can CRUD visits at their clinic
CREATE POLICY "Staff can view clinic visits" ON visits
  FOR SELECT USING (clinic_id = get_current_clinic_id());

CREATE POLICY "Staff can create clinic visits" ON visits
  FOR INSERT WITH CHECK (clinic_id = get_current_clinic_id());

CREATE POLICY "Staff can update clinic visits" ON visits
  FOR UPDATE USING (clinic_id = get_current_clinic_id());

-- Audio uploads: Staff can CRUD for their clinic's visits
CREATE POLICY "Staff can view clinic audio" ON audio_uploads
  FOR SELECT USING (
    visit_id IN (SELECT id FROM visits WHERE clinic_id = get_current_clinic_id())
  );

CREATE POLICY "Staff can create clinic audio" ON audio_uploads
  FOR INSERT WITH CHECK (
    visit_id IN (SELECT id FROM visits WHERE clinic_id = get_current_clinic_id())
  );

CREATE POLICY "Staff can update clinic audio" ON audio_uploads
  FOR UPDATE USING (
    visit_id IN (SELECT id FROM visits WHERE clinic_id = get_current_clinic_id())
  );

-- Provider notes: Staff can CRUD for their clinic's visits
CREATE POLICY "Staff can view clinic provider notes" ON provider_notes
  FOR SELECT USING (
    visit_id IN (SELECT id FROM visits WHERE clinic_id = get_current_clinic_id())
  );

CREATE POLICY "Staff can create clinic provider notes" ON provider_notes
  FOR INSERT WITH CHECK (
    visit_id IN (SELECT id FROM visits WHERE clinic_id = get_current_clinic_id())
  );

CREATE POLICY "Staff can update clinic provider notes" ON provider_notes
  FOR UPDATE USING (
    visit_id IN (SELECT id FROM visits WHERE clinic_id = get_current_clinic_id())
  );

-- Patient notes: Staff can CRUD, patients can view via magic link
CREATE POLICY "Staff can view clinic patient notes" ON patient_notes
  FOR SELECT USING (
    visit_id IN (SELECT id FROM visits WHERE clinic_id = get_current_clinic_id())
  );

CREATE POLICY "Staff can create clinic patient notes" ON patient_notes
  FOR INSERT WITH CHECK (
    visit_id IN (SELECT id FROM visits WHERE clinic_id = get_current_clinic_id())
  );

CREATE POLICY "Staff can update clinic patient notes" ON patient_notes
  FOR UPDATE USING (
    visit_id IN (SELECT id FROM visits WHERE clinic_id = get_current_clinic_id())
  );

-- Magic links: Staff can create, public can read (for token validation)
CREATE POLICY "Staff can manage clinic magic links" ON magic_links
  FOR ALL USING (
    patient_id IN (SELECT id FROM patients WHERE clinic_id = get_current_clinic_id())
  );

-- Public read for magic link token validation (handled by Edge Function with service role)

-- Audit logs: Insert only for staff, read for admins
CREATE POLICY "Anyone can insert audit logs" ON audit_logs
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Staff can view own audit logs" ON audit_logs
  FOR SELECT USING (
    actor_id = get_current_staff_id() OR
    resource_id IN (SELECT id FROM visits WHERE clinic_id = get_current_clinic_id())
  );

-- Message logs: Staff can view for their clinic
CREATE POLICY "Staff can view clinic messages" ON message_logs
  FOR SELECT USING (
    patient_id IN (SELECT id FROM patients WHERE clinic_id = get_current_clinic_id())
  );

CREATE POLICY "Staff can create clinic messages" ON message_logs
  FOR INSERT WITH CHECK (
    patient_id IN (SELECT id FROM patients WHERE clinic_id = get_current_clinic_id())
  );
