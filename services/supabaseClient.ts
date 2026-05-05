// This uses the global 'supabase' variable injected by the CDN script in index.html
declare const supabase: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createClient: (url: string, key: string) => any;
};

const supabaseUrl = 'https://wpzigasfuizrabqqzxln.supabase.co';
// This is a public anonymous key and is safe to be exposed in client-side code.
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndwemlnYXNmdWl6cmFicXF6eGxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxMzk2MzMsImV4cCI6MjA4MjcxNTYzM30.zmGhB5y1CAVpKYHDXYcA6lC0KsiTGIHUv1AcJw3mWmY';

export const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);