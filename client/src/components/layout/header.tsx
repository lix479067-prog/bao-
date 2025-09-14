import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Bell, LogOut } from "lucide-react";

const pageTitles = {
  "/": "仪表板",
  "/orders": "订单管理",
  "/users": "用户管理",
  "/bot-config": "机器人配置",
  "/templates": "报备模板",
  "/settings": "系统设置",
};

export default function Header() {
  const [location] = useLocation();

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  const currentTitle = pageTitles[location as keyof typeof pageTitles] || "仪表板";

  return (
    <header className="bg-card border-b border-border p-4 flex items-center justify-between" data-testid="header">
      <div className="flex items-center">
        <h1 className="text-xl font-semibold text-card-foreground" data-testid="text-page-title">
          {currentTitle}
        </h1>
      </div>
      
      <div className="flex items-center space-x-4">
        {/* Notification Bell */}
        <div className="relative">
          <Button 
            variant="ghost" 
            size="sm"
            className="p-2 hover:bg-muted rounded-md transition-colors relative"
            data-testid="button-notifications"
          >
            <Bell className="w-5 h-5 text-muted-foreground" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-destructive rounded-full text-xs"></span>
          </Button>
        </div>
        
        {/* Logout Button */}
        <Button 
          onClick={handleLogout}
          variant="secondary"
          size="sm"
          data-testid="button-logout"
        >
          <LogOut className="w-4 h-4 mr-2" />
          退出
        </Button>
      </div>
    </header>
  );
}
