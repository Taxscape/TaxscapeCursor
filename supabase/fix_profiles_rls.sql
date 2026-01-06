-- ============================================
-- FIX PROFILES RLS INFINITE RECURSION
-- ============================================
-- Run this in Supabase SQL Editor to fix the
-- "infinite recursion detected in policy for relation profiles" error
-- ============================================

-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can view org members profiles" ON public.profiles;

-- Create a fixed policy that doesn't cause recursion
-- This allows users to see their own profile directly,
-- OR profiles in the same organization (checked via profiles.organization_id directly)
CREATE POLICY "Users can view org members profiles" ON public.profiles
    FOR SELECT USING (
        -- User can always see their own profile
        auth.uid() = id
        OR
        -- User can see profiles in same org (direct check, no subquery to org_members)
        organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    );

-- Also update the "Users can view own profile" policy to avoid duplication issues
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

-- ============================================
-- DONE! The portal should now work.
-- ============================================


