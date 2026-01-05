-- Fix infinite recursion in profiles RLS policy
-- The issue: get_user_org_id() queries profiles table, but profiles policy calls get_user_org_id()

-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can view org members profiles" ON public.profiles;

-- Recreate with a non-recursive approach using organization_members directly
CREATE POLICY "Users can view org members profiles" ON public.profiles
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
        )
    );




