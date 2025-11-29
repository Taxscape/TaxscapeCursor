-- TaxScape Pro Database Schema for Supabase
-- Run this in the Supabase SQL Editor

-- Enable UUID extension (usually already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- PROFILES TABLE (extends auth.users)
-- ============================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    company_name TEXT,
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trigger to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- PROJECTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    technical_uncertainty TEXT,
    process_of_experimentation TEXT,
    qualification_status TEXT DEFAULT 'pending' CHECK (qualification_status IN ('pending', 'qualified', 'not_qualified')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);

-- ============================================
-- EMPLOYEES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.employees (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    title TEXT,
    state TEXT,
    total_wages DECIMAL(12, 2) DEFAULT 0,
    qualified_percent DECIMAL(5, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employees_user_id ON public.employees(user_id);

-- ============================================
-- CONTRACTORS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.contractors (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    cost DECIMAL(12, 2) DEFAULT 0,
    is_qualified BOOLEAN DEFAULT TRUE,
    location TEXT DEFAULT 'US',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contractors_user_id ON public.contractors(user_id);
CREATE INDEX IF NOT EXISTS idx_contractors_project_id ON public.contractors(project_id);

-- ============================================
-- PROJECT ALLOCATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.project_allocations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    allocation_percent DECIMAL(5, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(employee_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_allocations_employee_id ON public.project_allocations(employee_id);
CREATE INDEX IF NOT EXISTS idx_allocations_project_id ON public.project_allocations(project_id);

-- ============================================
-- CHAT SESSIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.chat_sessions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    title TEXT DEFAULT 'New Audit Session',
    structured_output JSONB,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON public.chat_sessions(user_id);

-- ============================================
-- CHAT MESSAGES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    session_id UUID REFERENCES public.chat_sessions(id) ON DELETE CASCADE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON public.chat_messages(session_id);

-- ============================================
-- STUDIES TABLE (generated reports)
-- ============================================
CREATE TABLE IF NOT EXISTS public.studies (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    chat_session_id UUID REFERENCES public.chat_sessions(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    file_path TEXT, -- Supabase Storage path
    file_url TEXT,  -- Public or signed URL
    total_qre DECIMAL(12, 2) DEFAULT 0,
    total_credit DECIMAL(12, 2) DEFAULT 0,
    status TEXT DEFAULT 'generated' CHECK (status IN ('generating', 'generated', 'failed')),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studies_user_id ON public.studies(user_id);

-- ============================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studies ENABLE ROW LEVEL SECURITY;

-- PROFILES policies
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON public.profiles
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
    );

-- PROJECTS policies
CREATE POLICY "Users can view own projects" ON public.projects
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own projects" ON public.projects
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects" ON public.projects
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects" ON public.projects
    FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all projects" ON public.projects
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
    );

-- EMPLOYEES policies
CREATE POLICY "Users can view own employees" ON public.employees
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own employees" ON public.employees
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own employees" ON public.employees
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own employees" ON public.employees
    FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all employees" ON public.employees
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
    );

-- CONTRACTORS policies
CREATE POLICY "Users can view own contractors" ON public.contractors
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own contractors" ON public.contractors
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own contractors" ON public.contractors
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own contractors" ON public.contractors
    FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all contractors" ON public.contractors
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
    );

-- PROJECT_ALLOCATIONS policies
CREATE POLICY "Users can view own allocations" ON public.project_allocations
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.employees WHERE id = employee_id AND user_id = auth.uid())
    );

CREATE POLICY "Users can insert own allocations" ON public.project_allocations
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.employees WHERE id = employee_id AND user_id = auth.uid())
    );

CREATE POLICY "Users can update own allocations" ON public.project_allocations
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.employees WHERE id = employee_id AND user_id = auth.uid())
    );

CREATE POLICY "Users can delete own allocations" ON public.project_allocations
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.employees WHERE id = employee_id AND user_id = auth.uid())
    );

-- CHAT_SESSIONS policies
CREATE POLICY "Users can view own chat sessions" ON public.chat_sessions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own chat sessions" ON public.chat_sessions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own chat sessions" ON public.chat_sessions
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own chat sessions" ON public.chat_sessions
    FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all chat sessions" ON public.chat_sessions
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
    );

-- CHAT_MESSAGES policies
CREATE POLICY "Users can view own chat messages" ON public.chat_messages
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.chat_sessions WHERE id = session_id AND user_id = auth.uid())
    );

CREATE POLICY "Users can insert own chat messages" ON public.chat_messages
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.chat_sessions WHERE id = session_id AND user_id = auth.uid())
    );

CREATE POLICY "Admins can view all chat messages" ON public.chat_messages
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
    );

-- STUDIES policies
CREATE POLICY "Users can view own studies" ON public.studies
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own studies" ON public.studies
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own studies" ON public.studies
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own studies" ON public.studies
    FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all studies" ON public.studies
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
    );

-- ============================================
-- STORAGE BUCKET FOR STUDIES
-- ============================================
-- Run this in Supabase Dashboard > Storage > Create new bucket
-- Bucket name: studies
-- Public: false (use signed URLs)

-- Storage policies (run in SQL editor after creating bucket)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('studies', 'studies', false);

-- CREATE POLICY "Users can upload own studies" ON storage.objects
--     FOR INSERT WITH CHECK (
--         bucket_id = 'studies' AND 
--         auth.uid()::text = (storage.foldername(name))[1]
--     );

-- CREATE POLICY "Users can view own studies" ON storage.objects
--     FOR SELECT USING (
--         bucket_id = 'studies' AND 
--         auth.uid()::text = (storage.foldername(name))[1]
--     );

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON public.employees
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_contractors_updated_at BEFORE UPDATE ON public.contractors
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_chat_sessions_updated_at BEFORE UPDATE ON public.chat_sessions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to update last_active_at on profile
CREATE OR REPLACE FUNCTION public.update_last_active()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.profiles SET last_active_at = NOW() WHERE id = auth.uid();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

