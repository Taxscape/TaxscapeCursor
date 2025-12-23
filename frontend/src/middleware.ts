import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Routes that require authentication
const protectedRoutes = ['/portal', '/admin'];

// Main domains (not subdomains) - add your production domain here
const mainDomains = ['localhost', 'vercel.app', 'taxscape.io', 'taxscape.com'];

// Extract subdomain from hostname
function getSubdomain(hostname: string): string | null {
  // Remove port if present
  const host = hostname.split(':')[0];
  
  // Check if it's a main domain (no subdomain)
  for (const mainDomain of mainDomains) {
    if (host === mainDomain || host.endsWith(`.${mainDomain}`)) {
      // Extract subdomain
      const parts = host.split('.');
      
      // For localhost, there's no subdomain
      if (host === 'localhost' || host === mainDomain) {
        return null;
      }
      
      // For *.vercel.app, the first part before vercel.app is the project name, not org
      if (mainDomain === 'vercel.app' && parts.length <= 2) {
        return null;
      }
      
      // For custom domains like acme.taxscape.io
      if (parts.length > mainDomain.split('.').length) {
        const subdomain = parts[0];
        // Skip common non-org subdomains
        if (['www', 'app', 'api', 'admin', 'staging', 'dev'].includes(subdomain)) {
          return null;
        }
        return subdomain;
      }
    }
  }
  
  return null;
}

export async function middleware(request: NextRequest) {
  try {
    // 1. Create response placeholder
    let response = NextResponse.next({
      request: {
        headers: request.headers,
      },
    });

    // 2. Detect organization subdomain
    const hostname = request.headers.get('host') || '';
    const orgSlug = getSubdomain(hostname);
    
    // If org subdomain detected, add it to headers for downstream use
    if (orgSlug) {
      response.headers.set('x-org-slug', orgSlug);
      // Also set a cookie for client-side access
      response.cookies.set('org-slug', orgSlug, {
        path: '/',
        maxAge: 60 * 60 * 24, // 24 hours
        sameSite: 'lax',
      });
    }

    // 3. Check if Supabase env vars are present
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return response;
    }

    // 4. Create Supabase client
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            request.cookies.set({ name, value, ...options });
            response = NextResponse.next({
              request: { headers: request.headers },
            });
            response.cookies.set({ name, value, ...options });
            // Preserve org-slug header
            if (orgSlug) {
              response.headers.set('x-org-slug', orgSlug);
            }
          },
          remove(name: string, options: CookieOptions) {
            request.cookies.set({ name, value: '', ...options });
            response = NextResponse.next({
              request: { headers: request.headers },
            });
            response.cookies.set({ name, value: '', ...options });
            // Preserve org-slug header
            if (orgSlug) {
              response.headers.set('x-org-slug', orgSlug);
            }
          },
        },
      }
    );

    // 5. Get session
    const { data: { session } } = await supabase.auth.getSession();

    // 6. Check if accessing a protected route
    const isProtectedRoute = protectedRoutes.some(route => 
      request.nextUrl.pathname.startsWith(route)
    );

    // 7. Redirect to login if accessing protected route without session
    if (isProtectedRoute && !session) {
      const redirectUrl = new URL('/login', request.url);
      redirectUrl.searchParams.set('redirect', request.nextUrl.pathname);
      return NextResponse.redirect(redirectUrl);
    }

    // 8. Let login/register pages handle their own redirects
    return response;
  } catch (e) {
    console.error('Middleware error:', e);
    return NextResponse.next({
      request: {
        headers: request.headers,
      },
    });
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
