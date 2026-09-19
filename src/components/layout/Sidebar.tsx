import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Boxes,
  Truck,
  Users,
  BarChart3,
  Receipt,
  Settings,
} from "lucide-react";

import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "Caisse", icon: ShoppingCart, end: true },
  { to: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { to: "/products", label: "Produits", icon: Package },
  { to: "/stock", label: "Stock", icon: Boxes },
  { to: "/purchases", label: "Achats", icon: Truck },
  { to: "/customers", label: "Clients", icon: Users },
  { to: "/reports", label: "Rapports", icon: BarChart3 },
  { to: "/expenses", label: "Dépenses", icon: Receipt },
  { to: "/settings", label: "Paramètres", icon: Settings },
];

export function Sidebar() {
  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground">
          M3
        </div>
        <span className="text-sm font-semibold text-white">MedLib M3</span>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                  : "text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3 text-xs text-sidebar-muted-foreground">
        Local · Hors ligne
      </div>
    </aside>
  );
}
