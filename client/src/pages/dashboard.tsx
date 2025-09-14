import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Clock, Users, Bot, FileText, CheckCircle, XCircle } from "lucide-react";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/dashboard/stats"],
  });

  const { data: recentOrders, isLoading: ordersLoading } = useQuery({
    queryKey: ["/api/dashboard/recent-orders"],
  });

  const getOrderTypeIcon = (type: string) => {
    switch (type) {
      case "deposit":
        return "💰";
      case "withdrawal":
        return "💸";
      case "refund":
        return "🔄";
      default:
        return "📋";
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: "bg-amber-100 text-amber-800",
      approved: "bg-green-100 text-green-800",
      rejected: "bg-red-100 text-red-800",
    };
    
    const labels = {
      pending: "待处理",
      approved: "已确认",
      rejected: "已拒绝",
    };

    return (
      <span className={`px-2 py-1 text-xs rounded-full ${styles[status as keyof typeof styles] || styles.pending}`}>
        {labels[status as keyof typeof labels] || status}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground" data-testid="text-page-title">仪表板</h1>
        <p className="text-muted-foreground">系统运行状态和数据概览</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card data-testid="card-today-orders">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">今日订单</p>
                {statsLoading ? (
                  <Skeleton className="h-8 w-16 mt-2" />
                ) : (
                  <p className="text-2xl font-semibold text-foreground" data-testid="text-today-orders">
                    {(stats as any)?.todayOrders || 0}
                  </p>
                )}
              </div>
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                <FileText className="w-6 h-6 text-primary" />
              </div>
            </div>
            <div className="flex items-center mt-4">
              <TrendingUp className="w-4 h-4 text-green-600 mr-1" />
              <span className="text-green-600 text-sm">较昨日</span>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-pending-orders">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">待处理</p>
                {statsLoading ? (
                  <Skeleton className="h-8 w-16 mt-2" />
                ) : (
                  <p className="text-2xl font-semibold text-foreground" data-testid="text-pending-orders">
                    {(stats as any)?.pendingOrders || 0}
                  </p>
                )}
              </div>
              <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
                <Clock className="w-6 h-6 text-amber-600" />
              </div>
            </div>
            <div className="flex items-center mt-4">
              <span className="text-muted-foreground text-sm">需要审批</span>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-active-employees">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">活跃员工</p>
                {statsLoading ? (
                  <Skeleton className="h-8 w-16 mt-2" />
                ) : (
                  <p className="text-2xl font-semibold text-foreground" data-testid="text-active-employees">
                    {(stats as any)?.activeEmployees || 0}
                  </p>
                )}
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-green-600" />
              </div>
            </div>
            <div className="flex items-center mt-4">
              <span className="text-muted-foreground text-sm">在线员工</span>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-bot-status">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">机器人状态</p>
                <p className="text-2xl font-semibold text-green-600" data-testid="text-bot-status">在线</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <Bot className="w-6 h-6 text-green-600" />
              </div>
            </div>
            <div className="flex items-center mt-4">
              <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
              <span className="text-muted-foreground text-sm">正常运行</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Orders and Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-testid="card-recent-orders">
          <CardHeader>
            <CardTitle>最近订单</CardTitle>
          </CardHeader>
          <CardContent>
            {ordersLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center space-x-3">
                    <Skeleton className="w-10 h-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-6 w-16" />
                  </div>
                ))}
              </div>
            ) : recentOrders && Array.isArray(recentOrders) && recentOrders.length > 0 ? (
              <div className="space-y-4">
                {(recentOrders as any[])?.map((order: any) => (
                  <div key={order.id} className="flex items-center justify-between py-3 border-b border-border last:border-b-0" data-testid={`row-order-${order.id}`}>
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center mr-3">
                        <span className="text-sm">{getOrderTypeIcon(order.type)}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground" data-testid={`text-order-${order.id}`}>
                          {order.type === 'deposit' ? '入款报备' : order.type === 'withdrawal' ? '出款报备' : '退款报备'} {order.orderNumber}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {order.telegramUser?.username || order.telegramUser?.firstName || '未知员工'} • {new Date(order.createdAt).toLocaleString('zh-CN')}
                        </p>
                      </div>
                    </div>
                    {getStatusBadge(order.status)}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">暂无订单记录</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-system-activity">
          <CardHeader>
            <CardTitle>系统活动</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start">
                <div className="w-2 h-2 bg-green-500 rounded-full mt-2 mr-3"></div>
                <div>
                  <p className="text-sm text-foreground">机器人服务启动</p>
                  <p className="text-xs text-muted-foreground">刚刚</p>
                </div>
              </div>
              <div className="flex items-start">
                <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3"></div>
                <div>
                  <p className="text-sm text-foreground">系统初始化完成</p>
                  <p className="text-xs text-muted-foreground">1分钟前</p>
                </div>
              </div>
              <div className="flex items-start">
                <div className="w-2 h-2 bg-purple-500 rounded-full mt-2 mr-3"></div>
                <div>
                  <p className="text-sm text-foreground">数据库连接建立</p>
                  <p className="text-xs text-muted-foreground">2分钟前</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
