import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { OrderDetailsModal } from "@/components/modals/order-details-modal";
import { TelegramUserLink } from "@/components/ui/telegram-user-link";
import { Eye, CheckCircle, XCircle, Search } from "lucide-react";

export default function Orders() {
  // Initialize filters from URL parameters
  const getInitialFilters = () => {
    const urlParams = new URLSearchParams(window.location.search);
    return {
      status: urlParams.get('status') || "all",
      type: urlParams.get('type') || "all", 
      search: urlParams.get('search') || "",
      page: parseInt(urlParams.get('page') || "1"),
    };
  };

  const [filters, setFilters] = useState(getInitialFilters);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.status && filters.status !== "all") params.set("status", filters.status);
    if (filters.type && filters.type !== "all") params.set("type", filters.type);
    if (filters.search) params.set("search", filters.search);
    if (filters.page > 1) params.set("page", filters.page.toString());
    
    const newUrl = params.toString() ? `${window.location.pathname}?${params}` : window.location.pathname;
    window.history.replaceState({}, '', newUrl);
  }, [filters]);

  const { data: ordersData, isLoading } = useQuery({
    queryKey: ["/api/orders", filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.status && filters.status !== "all") params.append("status", filters.status);
      if (filters.type && filters.type !== "all") params.append("type", filters.type);
      if (filters.search) params.append("search", filters.search);
      params.append("page", filters.page.toString());
      params.append("limit", "10");
      
      return fetch(`/api/orders?${params}`).then(res => res.json());
    },
  });

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

  // Order details modal handlers
  const openOrderDetails = (order: any) => {
    setSelectedOrder(order);
    setIsOrderModalOpen(true);
  };

  const closeOrderDetails = () => {
    setSelectedOrder(null);
    setIsOrderModalOpen(false);
  };

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

  const getStatusBadge = (status: string) => {
    const variants = {
      pending: "default" as const,
      approved: "default" as const,
      rejected: "destructive" as const,
    };
    
    const labels = {
      pending: "待处理",
      approved: "已确认",
      rejected: "已拒绝",
    };

    return (
      <Badge variant={variants[status as keyof typeof variants] || "default"} data-testid={`status-${status}`}>
        {labels[status as keyof typeof labels] || status}
      </Badge>
    );
  };

  const getTypeBadge = (type: string) => {
    const labels = {
      deposit: "入款报备",
      withdrawal: "出款报备",
      refund: "退款报备",
    };

    const colors = {
      deposit: "bg-blue-100 text-blue-800",
      withdrawal: "bg-green-100 text-green-800",
      refund: "bg-red-100 text-red-800",
    };

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[type as keyof typeof colors] || "bg-gray-100 text-gray-800"}`} data-testid={`type-${type}`}>
        {labels[type as keyof typeof labels] || type}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground" data-testid="text-page-title">订单管理</h1>
        <p className="text-muted-foreground">查看和管理所有报备订单</p>
      </div>

      <Card data-testid="card-orders">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle data-testid="text-card-title">订单列表</CardTitle>
            <div className="flex items-center space-x-4">
              <Select value={filters.status} onValueChange={(value) => setFilters(prev => ({ ...prev, status: value, page: 1 }))}>
                <SelectTrigger className="w-32" data-testid="select-status">
                  <SelectValue placeholder="全部状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="pending">待处理</SelectItem>
                  <SelectItem value="approved">已确认</SelectItem>
                  <SelectItem value="rejected">已拒绝</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={filters.type} onValueChange={(value) => setFilters(prev => ({ ...prev, type: value, page: 1 }))}>
                <SelectTrigger className="w-32" data-testid="select-type">
                  <SelectValue placeholder="全部类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部类型</SelectItem>
                  <SelectItem value="deposit">入款报备</SelectItem>
                  <SelectItem value="withdrawal">出款报备</SelectItem>
                  <SelectItem value="refund">退款报备</SelectItem>
                </SelectContent>
              </Select>
              
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="搜索订单..."
                  value={filters.search}
                  onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value, page: 1 }))}
                  className="pl-10 w-48"
                  data-testid="input-search"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center space-x-4">
                  <Skeleton className="h-12 w-full" />
                </div>
              ))}
            </div>
          ) : ordersData?.orders && ordersData.orders.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>订单号</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>员工</TableHead>
                      <TableHead>金额</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>提交时间</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ordersData.orders.map((order: any) => (
                      <TableRow key={order.id} data-testid={`row-order-${order.id}`}>
                        <TableCell className="font-medium" data-testid={`text-order-number-${order.id}`}>
                          {order.orderNumber}
                        </TableCell>
                        <TableCell>
                          {getTypeBadge(order.type)}
                        </TableCell>
                        <TableCell data-testid={`text-employee-${order.id}`}>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                              {order.telegramUser?.firstName || order.telegramUser?.username || '未知员工'}
                            </span>
                            {order.telegramUser && (
                              <TelegramUserLink 
                                user={{
                                  username: order.telegramUser.username,
                                  telegramId: order.telegramUser.telegramId,
                                  firstName: order.telegramUser.firstName
                                }}
                                variant="button"
                                className="ml-1"
                                data-testid={`telegram-contact-${order.id}`}
                              />
                            )}
                          </div>
                        </TableCell>
                        <TableCell data-testid={`text-amount-${order.id}`}>
                          {order.amount}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(order.status)}
                        </TableCell>
                        <TableCell className="text-muted-foreground" data-testid={`text-created-${order.id}`}>
                          {new Date(order.createdAt).toLocaleString('zh-CN')}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end space-x-2">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => openOrderDetails(order)}
                              data-testid={`button-view-${order.id}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {order.status === 'pending' && (
                              <>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => handleQuickApprove(order.id)}
                                  disabled={isProcessing}
                                  className="text-green-600 hover:text-green-500"
                                  data-testid={`button-approve-${order.id}`}
                                >
                                  <CheckCircle className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              
              {/* Pagination */}
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground" data-testid="text-pagination-info">
                  显示 {((filters.page - 1) * 10) + 1}-{Math.min(filters.page * 10, ordersData.total)} 条，共 {ordersData.total} 条记录
                </p>
                <div className="flex items-center space-x-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setFilters(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                    disabled={filters.page <= 1}
                    data-testid="button-prev-page"
                  >
                    上一页
                  </Button>
                  <span className="text-sm" data-testid="text-current-page">
                    第 {filters.page} 页
                  </span>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setFilters(prev => ({ ...prev, page: prev.page + 1 }))}
                    disabled={!ordersData || filters.page * 10 >= ordersData.total}
                    data-testid="button-next-page"
                  >
                    下一页
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Eye className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">暂无订单记录</p>
            </div>
          )}
        </CardContent>
      </Card>

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
