-- supabase/migrations/20240328000000_init_schema.sql

-- 1. Create Profiles Table (Extension of Auth)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  email TEXT,
  role TEXT DEFAULT 'parent' CHECK (role IN ('admin', 'driver', 'parent')),
  bus_id TEXT,
  avatar_url TEXT,
  phone_number TEXT,
  home_lat DOUBLE PRECISION,
  home_lng DOUBLE PRECISION,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create Bus Locations Table (For Live Tracking)
CREATE TABLE IF NOT EXISTS public.bus_locations (
  bus_id TEXT PRIMARY KEY,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  speed INT DEFAULT 0,
  heading INT DEFAULT 0,
  is_active BOOLEAN DEFAULT false,
  last_updated TIMESTAMPTZ DEFAULT now()
);

-- 3. Create Incident Reports Table
CREATE TABLE IF NOT EXISTS public.incident_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_type TEXT,
  details TEXT,
  incident_time TIMESTAMPTZ,
  reference TEXT UNIQUE,
  status TEXT DEFAULT 'open',
  submitted_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Create Emergency Alerts Table (SOS)
CREATE TABLE IF NOT EXISTS public.emergency_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID REFERENCES auth.users(id),
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  status TEXT DEFAULT 'active',
  timestamp TIMESTAMPTZ DEFAULT now()
);

-- 5. Create Inspections Table (Checklist)
CREATE TABLE IF NOT EXISTS public.inspections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID REFERENCES auth.users(id),
  odometer_reading INT,
  notes TEXT,
  status TEXT DEFAULT 'completed',
  timestamp TIMESTAMPTZ DEFAULT now()
);

-- 6. Create Notifications Table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  title TEXT,
  message TEXT,
  type TEXT, 
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Enable Realtime for specific tables
-- Note: This part is usually handled via the Supabase Dashboard, 
-- but we include it here for a complete record.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE bus_locations;
ALTER PUBLICATION supabase_realtime ADD TABLE emergency_alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- 8. Create Routes Table
CREATE TABLE IF NOT EXISTS public.routes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  bus_id TEXT, -- This links to bus_locations.bus_id
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 9. Create Stops Table
CREATE TABLE IF NOT EXISTS public.stops (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  route_id UUID REFERENCES public.routes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  arrival_time TEXT,
  students INT DEFAULT 0,
  order_index INT NOT NULL, -- Crucial for sorting the path
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Realtime for these new tables
ALTER PUBLICATION supabase_realtime ADD TABLE routes;
ALTER PUBLICATION supabase_realtime ADD TABLE stops;