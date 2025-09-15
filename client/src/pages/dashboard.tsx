import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { OrderDetailsModal } from "@/components/modals/order-details-modal";
import { TelegramUserLink } from "@/components/ui/telegram-user-link";
import { formatDateTimeBeijing } from "@shared/utils/timeUtils";
import { TrendingUp, Clock, Users, Bot, FileText, CheckCircle, XCircle, ArrowRight, Eye, Edit3 } from "lucide-react";
import { Link } from "wouter";

export default function Dashboard() {
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/dashboard/stats"],
  });

  const { data: recentOrders, isLoading: ordersLoading } = useQuery({
    queryKey: ["/api/dashboard/recent-orders"],
  });

  // Query for pending orders with quick actions
  const { data: pendingOrdersData, isLoading: pendingOrdersLoading } = useQuery({
    queryKey: ["/api/orders", { status: "pending", limit: 5 }],
    queryFn: () => {
      const params = new URLSearchParams();
      params.append("status", "pending");
      params.append("limit", "5");
      return fetch(`/api/orders?${params}`).then(res => res.json());
    },
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Mutation for updating order status
  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status, rejectionReason }: { orderId: string; status: string; rejectionReason?: string }) => {
      await apiRequest("PATCH", `/api/orders/${orderId}/status`, { status, rejectionReason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/recent-orders"] });
      toast({
        title: "成功",
        description: "订单状态已更新",
      });
    },
    onError: (error) => {
      toast({
        title: "错误",
        description: "更新失败: " + error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation for modifying and approving order
  const modifyOrderMutation = useMutation({
    mutationFn: async ({ orderId, modifiedContent }: { orderId: string; modifiedContent: string }) => {
      await apiRequest("PATCH", `/api/orders/${orderId}/modify`, { modifiedContent });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/recent-orders"] });
      toast({
        title: "成功",
        description: "订单已修改并通过",
      });
    },
    onError: (error) => {
      toast({
        title: "错误",
        description: "修改失败: " + error.message,
        variant: "destructive",
      });
    },
  });

  // Quick approve handler for inline buttons
  const handleQuickApprove = (orderId: string) => {
    updateStatusMutation.mutate({ orderId, status: "approved" });
  };

  const openOrderDetails = (order: any) => {
    setSelectedOrder(order);
    setIsOrderModalOpen(true);
  };

  const closeOrderDetails = () => {
    setSelectedOrder(null);
    setIsOrderModalOpen(false);
  };

  // Order modal handlers
  const handleOrderApprove = (orderId: string) => {
    updateStatusMutation.mutate({ orderId, status: "approved" });
  };

  const handleOrderReject = (orderId: string, rejectionReason: string) => {
    updateStatusMutation.mutate({ orderId, status: "rejected", rejectionReason });
  };

  const handleOrderModifyAndApprove = (orderId: string, modifiedContent: string) => {
    modifyOrderMutation.mutate({ orderId, modifiedContent });
  };

  // Check if any mutation is processing
  const isProcessing = updateStatusMutation.isPending || modifyOrderMutation.isPending;

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

        <Link href="/orders?status=pending" className="block">
          <Card data-testid="card-pending-orders" className="hover:shadow-lg transition-shadow cursor-pointer border-amber-200 hover:border-amber-300">
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
              <div className="flex items-center justify-between mt-4">
                <span className="text-muted-foreground text-sm">需要审批</span>
                <div className="flex items-center text-amber-600 text-sm group">
                  <span className="mr-1">点击处理</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

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

      {/* Pending Orders Management */}
      {((stats as any)?.pendingOrders || 0) > 0 && (
        <Card data-testid="card-pending-orders-list" className="border-amber-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-amber-700">待审订单 ({(stats as any)?.pendingOrders || 0})</CardTitle>
              <Link href="/orders?status=pending">
                <Button variant="outline" size="sm" className="text-amber-600 border-amber-200 hover:bg-amber-50">
                  查看全部
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {pendingOrdersLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-amber-50/50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <Skeleton className="w-10 h-10 rounded-full" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <Skeleton className="h-8 w-16" />
                      <Skeleton className="h-8 w-16" />
                    </div>
                  </div>
                ))}
              </div>
            ) : pendingOrdersData?.orders && pendingOrdersData.orders.length > 0 ? (
              <div className="space-y-4">
                {pendingOrdersData.orders.map((order: any) => (
                  <div key={order.id} className="flex items-center justify-between p-4 bg-amber-50/50 rounded-lg border border-amber-100" data-testid={`pending-order-${order.id}`}>
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                        <span className="text-sm">{getOrderTypeIcon(order.type)}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground" data-testid={`text-pending-order-${order.id}`}>
                          {order.type === 'deposit' ? '入款报备' : order.type === 'withdrawal' ? '出款报备' : '退款报备'} {order.orderNumber}
                        </p>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          <span>{order.telegramUser?.firstName || order.telegramUser?.username || '未知员工'} • ¥{order.amount} • {formatDateTimeBeijing(order.createdAt)}</span>
                          {order.telegramUser && (
                            <TelegramUserLink 
                              user={{
                                username: order.telegramUser.username,
                                telegramId: order.telegramUser.telegramId,
                                firstName: order.telegramUser.firstName
                              }}
                              variant="link"
                              className="text-xs"
                              data-testid={`telegram-contact-dash-${order.id}`}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => openOrderDetails(order)}
                        className="text-blue-600 border-blue-200 hover:bg-blue-50"
                        data-testid={`button-details-${order.id}`}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        详情
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleQuickApprove(order.id)}
                        disabled={isProcessing}
                        className="text-green-600 border-green-200 hover:bg-green-50"
                        data-testid={`button-approve-${order.id}`}
                      >
                        <CheckCircle className="w-4 h-4 mr-1" />
                        通过
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>暂无待审订单</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          <span>{order.telegramUser?.firstName || order.telegramUser?.username || '未知员工'} • {formatDateTimeBeijing(order.createdAt)}</span>
                          {order.telegramUser && (
                            <TelegramUserLink 
                              user={{
                                username: order.telegramUser.username,
                                telegramId: order.telegramUser.telegramId,
                                firstName: order.telegramUser.firstName
                              }}
                              variant="link"
                              className="text-xs"
                              data-testid={`telegram-contact-pending-${order.id}`}
                            />
                          )}
                        </div>
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

      {/* Order Details Modal */}
      <OrderDetailsModal
        order={selectedOrder}
        open={isOrderModalOpen}
        onOpenChange={closeOrderDetails}
        onApprove={handleOrderApprove}
        onReject={handleOrderReject}
        onModifyAndApprove={handleOrderModifyAndApprove}
        isProcessing={isProcessing}
      />
    </div>
  );
}
