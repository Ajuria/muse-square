/// <reference types="astro/client" />

declare module "virtual:@clerk/astro/config" {
  const config: any;
  export default config;
}

declare module "*.astro" {
  const Component: any;
  export default Component;
}

declare namespace App {
  interface Locals {
    clerk_user_id?: string;
    location_id?: string;
    authStatus?: string;
    profileRowExists?: boolean;
    first_name?: string;
    all_location_ids?: string[];
    scope?: import("./lib/scope").OperationalScope;
  }
}