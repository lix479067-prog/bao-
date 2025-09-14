import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { 
  LayoutDashboard, 
  FileText, 
  Users, 
  Bot, 
  FileCode, 
  Settings,
  Activity,
  KeyRound
} from "lucide-react";

const navigation = [
  { name: "仪表板", href: "/", icon: LayoutDashboard },
  { name: "订单管理", href: "/orders", icon: FileText },
  { name: "用户管理", href: "/users", icon: Users },
  { name: "员工码管理", href: "/employee-codes", icon: KeyRound },
  { name: "机器人配置", href: "/bot-config", icon: Bot },
  { name: "报备模板", href: "/templates", icon: FileCode },
  { name: "系统设置", href: "/settings", icon: Settings },
];

export default function Sidebar() {
  const [location] = useLocation();
  const { user } = useAuth();

  const getUserInitials = () => {
    if ((user as any)?.firstName) {
      return (user as any).firstName.charAt(0).toUpperCase();
    }
    if ((user as any)?.email) {
      return (user as any).email.charAt(0).toUpperCase();
    }
    return "A";
  };

  const getUserDisplayName = () => {
    if ((user as any)?.firstName && (user as any)?.lastName) {
      return `${(user as any).firstName} ${(user as any).lastName}`;
    }
    if ((user as any)?.firstName) {
      return (user as any).firstName;
    }
    if ((user as any)?.email) {
      return (user as any).email.split('@')[0];
    }
    return "管理员";
  };

  return (
    <div className="fixed left-0 top-0 h-full w-64 bg-card border-r border-border z-40" data-testid="sidebar">
      {/* Logo */}
      <div className="flex items-center p-6 border-b border-border">
        <div className="w-8 h-8 bg-primary rounded-md flex items-center justify-center mr-3">
          <Bot className="w-5 h-5 text-primary-foreground" />
        </div>
        <span className="font-semibold text-card-foreground" data-testid="text-app-name">TG报备系统</span>
      </div>
      
      {/* Navigation */}
      <nav className="p-4">
        <ul className="space-y-2">
          {navigation.map((item) => {
            const isActive = location === item.href;
            return (
              <li key={item.name}>
                <Link 
                  href={item.href}
                  className={cn(
                    "flex items-center p-3 rounded-md transition-colors text-sm font-medium",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-card-foreground"
                  )}
                  data-testid={`nav-link-${item.href === '/' ? 'dashboard' : item.href.slice(1)}`}
                >
                  <item.icon className="w-5 h-5 mr-3" />
                  {item.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User Profile */}
      <div className="absolute bottom-4 left-4 right-4">
        <div className="bg-muted rounded-lg p-3">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center mr-2">
              <span className="text-xs text-primary-foreground font-medium" data-testid="text-user-initials">
                {getUserInitials()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-card-foreground truncate" data-testid="text-user-name">
                {getUserDisplayName()}
              </p>
              <div className="flex items-center">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-1"></div>
                <p className="text-xs text-muted-foreground">在线</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
