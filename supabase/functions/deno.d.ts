// Deno type declarations for Supabase Edge Functions

declare namespace Deno {
  export const env: {
    get(key: string): string | undefined;
  };
}

// Global types available in Deno runtime
declare var Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

// Allow URL imports for Deno (these are resolved at runtime)
// Using a catch-all pattern that allows any export
declare module "https://*" {
  const content: any;
  export default content;
  export * from content;
  // Allow named exports
  export function serve(handler: (req: Request) => Response | Promise<Response>): void;
  export function createClient(url: string, key: string, options?: any): any;
}

declare module "https://deno.land/*" {
  const content: any;
  export default content;
  export * from content;
  // Common Deno std exports
  export function serve(handler: (req: Request) => Response | Promise<Response>): void;
}

declare module "*.md" {
  const content: string;
  export default content;
}

declare module "https://esm.sh/*" {
  const content: any;
  export default content;
  export * from content;
  // Common ESM exports
  export function createClient(url: string, key: string, options?: any): any;
}

