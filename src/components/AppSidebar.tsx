import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { Car, Caravan, Settings, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const items = [
  { title: "Fahrzeuge", url: "/", icon: Car, match: (p: string) => p === "/" || p.startsWith("/fahrzeuge") },
  { title: "Wohnmobile", url: "/wohnmobile", icon: Caravan, match: (p: string) => p.startsWith("/wohnmobile") },
  { title: "Einstellungen", url: "/einstellungen", icon: Settings, match: (p: string) => p.startsWith("/einstellungen") },
];

export function AppSidebar({ userEmail }: { userEmail?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  const logout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r bg-sidebar">
      <div className="px-6 py-5 border-b">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-primary text-primary-foreground grid place-items-center font-bold">F</div>
          <div>
            <div className="font-semibold tracking-tight">Fleet</div>
            <div className="text-xs text-muted-foreground">Fahrzeugverwaltung</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {items.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.url}
              to={item.url}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.title}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-3 space-y-2">
        {userEmail && <div className="text-xs text-muted-foreground px-2 truncate">{userEmail}</div>}
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={logout}>
          <LogOut className="h-4 w-4" /> Abmelden
        </Button>
      </div>
    </aside>
  );
}
