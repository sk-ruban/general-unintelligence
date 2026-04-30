export type Tenant = {
  id: string;
  displayName: string;
  loginEmail: string;
  logoSrc: string;
};

export const activeTenant: Tenant = {
  id: "metlen",
  displayName: "Metlen",
  loginEmail: "operator@metlen.example",
  logoSrc: "/metlen-icon.png",
};

export const tenants: Tenant[] = [activeTenant];
