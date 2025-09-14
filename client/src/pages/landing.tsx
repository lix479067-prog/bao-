import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Landing() {
  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-primary-foreground" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
            </div>
            <h1 className="text-2xl font-semibold text-foreground mb-2" data-testid="app-title">
              TG报备机器人管理系统
            </h1>
            <p className="text-muted-foreground">
              企业级Telegram报备机器人管理平台
            </p>
          </div>
          
          <div className="space-y-4 mb-6">
            <div className="flex items-center text-sm">
              <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
              <span className="text-muted-foreground">智能报备流程管理</span>
            </div>
            <div className="flex items-center text-sm">
              <div className="w-2 h-2 bg-blue-500 rounded-full mr-3"></div>
              <span className="text-muted-foreground">实时审批通知系统</span>
            </div>
            <div className="flex items-center text-sm">
              <div className="w-2 h-2 bg-purple-500 rounded-full mr-3"></div>
              <span className="text-muted-foreground">多角色权限管理</span>
            </div>
          </div>

          <Button 
            onClick={handleLogin} 
            className="w-full" 
            size="lg"
            data-testid="button-login"
          >
            登录管理系统
          </Button>
          
          <p className="text-xs text-muted-foreground text-center mt-4">
            使用您的管理员账户登录以访问系统功能
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
