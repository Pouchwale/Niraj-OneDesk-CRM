/// <reference types="vite/client" />

/*
 * No VITE_ variables are read any more. The Supabase client and the demo-mode
 * switch are gone: the browser gets its data from this project's own server,
 * and every setting that matters (the Excel path, the AI key) stays on the
 * server side where it cannot reach the bundle.
 */
