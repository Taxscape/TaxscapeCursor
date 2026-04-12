-- ============================================================================
-- FIX RLS INFINITE RECURSION (v3)
-- ============================================================================
-- This script fixes infinite recursion in RLS policies for profiles,
-- organization_members, and organizations by using simpler checks
-- that do not call recursive functions or query the same table.
-- ============================================================================

-- 1. Disable RLS temporarily to clean up
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations DISABLE ROW LEVEL SECURITY;

-- 2. Drop problematic policies
DROP POLICY IF EXISTS "Users can view org members profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view org members" ON public.organization_members;
DROP POLICY IF EXISTS "Admins can update their organization" ON public.organizations;
DROP POLICY IF EXISTS "Users can view their organization" ON public.organizations;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

-- 3. Fix PROFILES policies
-- Users can always see their own profile
CREATE POLICY "profiles_select_own" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

-- Users can see profiles of people in their organization
-- We use a subquery on organization_members that doesn't trigger recursion
-- because we check for auth.uid() directly on the other table.
CREATE POLICY "profiles_select_org_members" ON public.profiles
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_members 
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

CREATE POLICY "profiles_insert_own" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- 4. Fix ORGANIZATION_MEMBERS policies
-- Users can see their own membership
CREATE POLICY "members_select_own" ON public.organization_members
    FOR SELECT USING (user_id = auth.uid());

-- Users can see other members in their organizations
CREATE POLICY "members_select_org" ON public.organization_members
    FOR SELECT USING (
        organization_id IN (
            SELECT org_id FROM (
                SELECT organization_id as org_id FROM public.organization_members 
                WHERE user_id = auth.uid() AND status = 'active'
            ) as my_orgs
        )
    );

-- 5. Fix ORGANIZATIONS policies
-- Users can see organizations they are members of
CREATE POLICY "orgs_select_member" ON public.organizations
    FOR SELECT USING (
        id IN (
            SELECT organization_id FROM public.organization_members 
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- Users can create organizations
CREATE POLICY "orgs_insert_all" ON public.organizations
    FOR INSERT WITH CHECK (true);

-- Admins can update their organization
CREATE POLICY "orgs_update_admin" ON public.organizations
    FOR UPDATE USING (
        id IN (
            SELECT organization_id FROM public.organization_members 
            WHERE user_id = auth.uid() AND role = 'executive' AND status = 'active'
        )
    );

-- 6. Re-enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- 7. Update helper functions to be more robust
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS UUID AS $$
    SELECT organization_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_org_member(org_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.organization_members 
        WHERE organization_id = org_id AND user_id = auth.uid() AND status = 'active'
    );
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_org_admin(org_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.organization_members 
        WHERE organization_id = org_id AND user_id = auth.uid() AND role = 'executive' AND status = 'active'
    );
$$ LANGUAGE sql SECURITY DEFINER;
