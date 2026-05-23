-- =========================================================
-- STEP 1: CREATE MASTER TENANT ARCHITECTURE
-- =========================================================

-- 1. Create the organizations control table
CREATE TABLE IF NOT EXISTS public.organizations (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    subdomain text UNIQUE NOT NULL,
    account_status text DEFAULT 'active',
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT organizations_pkey PRIMARY KEY (id)
);

-- =========================================================
-- STEP 2: INJECT PARTITIONING KEYS (SAFE ALTERATIONS)
-- =========================================================

-- Add organization_id columns safely checking if they exist first
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='organization_id') THEN
        ALTER TABLE public.profiles ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='buses' AND column_name='organization_id') THEN
        ALTER TABLE public.buses ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='routes' AND column_name='organization_id') THEN
        ALTER TABLE public.routes ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stops' AND column_name='organization_id') THEN
        ALTER TABLE public.stops ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='organization_id') THEN
        ALTER TABLE public.notifications ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inspections' AND column_name='organization_id') THEN
        ALTER TABLE public.inspections ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
    END IF;
END $$;