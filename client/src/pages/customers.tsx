import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { OrderDetailsModal } from "@/components/modals/order-details-modal";
import { TelegramUserLink } from "@/components/ui/telegram-user-link";
import { 
  Search, 
  Users, 
  TrendingUp, 
  DollarSign, 
  ArrowUpRight, 
  ArrowDownLeft, 
  RotateCcw,
  Calendar,
  Filter,
  Eye,
  CheckCircle,
  XCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  User,
  FileText
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export default function Customers() {
  // Initialize filters from URL parameters
  const getInitialFilters = () => {
    const urlParams = new URLSearchParams(window.location.search);
    return {
      search: urlParams.get('search') || "",
      page: parseInt(urlParams.get('page') || "1"),
      selectedCustomer: urlParams.get('customer') || null,
      orderType: urlParams.get('type') || "all",
      orderStatus: urlParams.get('status') || "all",
      dateFrom: urlParams.get('from') || "",
      dateTo: urlParams.get('to') || "",
      orderPage: parseInt(urlParams.get('orderPage') || "1"),
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
    if (filters.search) params.set("search", filters.search);
    if (filters.page > 1) params.set("page", filters.page.toString());
    if (filters.selectedCustomer) params.set("customer", filters.selectedCustomer);
    if (filters.orderType && filters.orderType !== "all") params.set("type", filters.orderType);
    if (filters.orderStatus && filters.orderStatus !== "all") params.set("status", filters.orderStatus);
    if (filters.dateFrom) params.set("from", filters.dateFrom);
    if (filters.dateTo) params.set("to", filters.dateTo);
    if (filters.orderPage > 1) params.set("orderPage", filters.orderPage.toString());
    
    const newUrl = params.toString() ? `${window.location.pathname}?${params}` : window.location.pathname;
    window.history.replaceState({}, '', newUrl);
  }, [filters]);

  // Search customers
  const { data: customersData, isLoading: customersLoading, refetch: refetchCustomers } = useQuery({
    queryKey: ["/api/customers/search", filters.search, filters.page],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.search) params.append("name", filters.search);
      params.append("page", filters.page.toString());
      params.append("limit", "20");
      
      return fetch(`/api/customers/search?${params}`).then(res => res.json());
    },
    enabled: true,
  });

  // Customer statistics
  const { data: customerStats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ["/api/customers", filters.selectedCustomer, "stats", filters.orderType, filters.orderStatus, filters.dateFrom, filters.dateTo],
    queryFn: () => {
      if (!filters.selectedCustomer) return null;
      
      const params = new URLSearchParams();
      if (filters.orderType && filters.orderType !== "all") params.append("type", filters.orderType);
      if (filters.orderStatus && filters.orderStatus !== "all") params.append("status", filters.orderStatus);
      if (filters.dateFrom) params.append("from", filters.dateFrom);
      if (filters.dateTo) params.append("to", filters.dateTo);
      
      const encodedCustomer = encodeURIComponent(filters.selectedCustomer);
      return fetch(`/api/customers/${encodedCustomer}/stats?${params}`).then(res => res.json());
    },
    enabled: !!filters.selectedCustomer,
  });

  // Customer orders
  const { data: ordersData, isLoading: ordersLoading, refetch: refetchOrders } = useQuery({
    queryKey: ["/api/customers", filters.selectedCustomer, "orders", filters.orderType, filters.orderStatus, filters.dateFrom, filters.dateTo, filters.orderPage],
    queryFn: () => {
      if (!filters.selectedCustomer) return null;
      
      const params = new URLSearchParams();
      if (filters.orderType && filters.orderType !== "all") params.append("type", filters.orderType);
      if (filters.orderStatus && filters.orderStatus !== "all") params.append("status", filters.orderStatus);
      if (filters.dateFrom) params.append("from", filters.dateFrom);
      if (filters.dateTo) params.append("to", filters.dateTo);
      params.append("page", filters.orderPage.toString());
      params.append("limit", "10");
      
      const encodedCustomer = encodeURIComponent(filters.selectedCustomer);
      return fetch(`/api/customers/${encodedCustomer}/orders?${params}`).then(res => res.json());
    },
    enabled: !!filters.selectedCustomer,
  });

  // Mutation for updating order status
  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status, rejectionReason }: { orderId: string; status: string; rejectionReason?: string }) => {
      await apiRequest("PATCH", `/api/orders/${orderId}/status`, { status, rejectionReason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      refetchStats();
      refetchOrders();
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
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      refetchStats();
      refetchOrders();
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

  // Handle customer selection
  const handleCustomerSelect = (customerName: string) => {
    setFilters(prev => ({ 
      ...prev, 
      selectedCustomer: customerName,
      orderPage: 1,
      orderType: "all",
      orderStatus: "all",
      dateFrom: "",
      dateTo: ""
    }));
  };

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
      deposit: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
      withdrawal: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
      refund: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    };

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[type as keyof typeof colors] || "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300"}`} data-testid={`type-${type}`}>
        {labels[type as keyof typeof labels] || type}
      </span>
    );
  };

  const handleRefreshAll = () => {
    refetchCustomers();
    if (filters.selectedCustomer) {
      refetchStats();
      refetchOrders();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground" data-testid="text-page-title">客户分析</h1>
        <p className="text-muted-foreground">搜索和分析客户交易数据</p>
      </div>

      {/* Search Section */}
      <Card data-testid="card-customer-search">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2" data-testid="text-search-title">
              <Search className="h-5 w-5" />
              客户搜索
            </CardTitle>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRefreshAll}
              disabled={customersLoading || statsLoading || ordersLoading}
              data-testid="button-refresh-all"
            >
              <RefreshCw className={cn("h-4 w-4 mr-2", (customersLoading || statsLoading || ordersLoading) && "animate-spin")} />
              刷新数据
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="输入客户名称搜索..."
                value={filters.search}
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value, page: 1 }))}
                className="w-full"
                data-testid="input-customer-search"
              />
            </div>
            <Button 
              variant="default"
              onClick={() => refetchCustomers()}
              disabled={customersLoading}
              data-testid="button-search"
            >
              <Search className="h-4 w-4 mr-2" />
              搜索
            </Button>
          </div>

          {/* Customer List */}
          <div className="mt-6">
            {customersLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="p-4 border rounded-lg">
                    <Skeleton className="h-6 w-full" />
                  </div>
                ))}
              </div>
            ) : customersData?.customers && customersData.customers.length > 0 ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {customersData.customers.map((customerName: string) => (
                    <Card 
                      key={customerName} 
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-accent/50 border",
                        filters.selectedCustomer === customerName && "ring-2 ring-primary bg-accent/30"
                      )}
                      onClick={() => handleCustomerSelect(customerName)}
                      data-testid={`customer-card-${customerName}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                            <User className="w-5 h-5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground truncate" data-testid={`text-customer-name-${customerName}`}>
                              {customerName}
                            </p>
                            <p className="text-sm text-muted-foreground">点击查看详情</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Customer Search Pagination */}
                {customersData.total > 20 && (
                  <div className="flex items-center justify-between mt-6">
                    <p className="text-sm text-muted-foreground" data-testid="text-customer-pagination-info">
                      显示 {((filters.page - 1) * 20) + 1}-{Math.min(filters.page * 20, customersData.total)} 个客户，共 {customersData.total} 个
                    </p>
                    <div className="flex items-center space-x-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setFilters(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                        disabled={filters.page <= 1 || customersLoading}
                        data-testid="button-prev-customers"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        上一页
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setFilters(prev => ({ ...prev, page: prev.page + 1 }))}
                        disabled={filters.page >= Math.ceil(customersData.total / 20) || customersLoading}
                        data-testid="button-next-customers"
                      >
                        下一页
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8">
                <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground" data-testid="text-no-customers">
                  {filters.search ? "未找到匹配的客户" : "暂无客户数据"}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Customer Statistics */}
      {filters.selectedCustomer && (
        <>
          <div>
            <h2 className="text-2xl font-semibold text-foreground mb-4" data-testid="text-customer-analysis-title">
              客户分析 - {filters.selectedCustomer}
            </h2>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setFilters(prev => ({ ...prev, selectedCustomer: null }))}
              className="mb-4"
              data-testid="button-back-to-search"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              返回搜索
            </Button>
          </div>

          {/* Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card data-testid="card-total-orders">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm">总订单数</p>
                    {statsLoading ? (
                      <Skeleton className="h-8 w-16 mt-2" />
                    ) : (
                      <p className="text-2xl font-semibold text-foreground" data-testid="text-total-orders">
                        {customerStats?.totalOrders || 0}
                      </p>
                    )}
                  </div>
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                    <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-total-amount">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm">总交易金额</p>
                    {statsLoading ? (
                      <Skeleton className="h-8 w-20 mt-2" />
                    ) : (
                      <p className="text-2xl font-semibold text-foreground" data-testid="text-total-amount">
                        ¥{customerStats?.totalAmount || "0.00"}
                      </p>
                    )}
                  </div>
                  <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                    <DollarSign className="w-6 h-6 text-green-600 dark:text-green-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-avg-amount">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm">平均金额</p>
                    {statsLoading ? (
                      <Skeleton className="h-8 w-20 mt-2" />
                    ) : (
                      <p className="text-2xl font-semibold text-foreground" data-testid="text-avg-amount">
                        ¥{customerStats?.avgAmount || "0.00"}
                      </p>
                    )}
                  </div>
                  <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-order-types">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm">订单类型分布</p>
                    {statsLoading ? (
                      <div className="space-y-1 mt-2">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-4 w-18" />
                      </div>
                    ) : (
                      <div className="mt-2 space-y-1" data-testid="text-order-distribution">
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-1">
                            <ArrowUpRight className="h-3 w-3 text-blue-600" />
                            入款
                          </span>
                          <span className="font-medium">{customerStats?.depositCount || 0}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-1">
                            <ArrowDownLeft className="h-3 w-3 text-green-600" />
                            出款
                          </span>
                          <span className="font-medium">{customerStats?.withdrawalCount || 0}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-1">
                            <RotateCcw className="h-3 w-3 text-red-600" />
                            退款
                          </span>
                          <span className="font-medium">{customerStats?.refundCount || 0}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Orders Section */}
          <Card data-testid="card-customer-orders">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <CardTitle className="flex items-center gap-2" data-testid="text-orders-title">
                  <FileText className="h-5 w-5" />
                  客户订单
                </CardTitle>
                
                {/* Order Filters */}
                <div className="flex items-center space-x-4">
                  <Select value={filters.orderType} onValueChange={(value) => setFilters(prev => ({ ...prev, orderType: value, orderPage: 1 }))}>
                    <SelectTrigger className="w-32" data-testid="select-order-type">
                      <SelectValue placeholder="全部类型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部类型</SelectItem>
                      <SelectItem value="deposit">入款报备</SelectItem>
                      <SelectItem value="withdrawal">出款报备</SelectItem>
                      <SelectItem value="refund">退款报备</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <Select value={filters.orderStatus} onValueChange={(value) => setFilters(prev => ({ ...prev, orderStatus: value, orderPage: 1 }))}>
                    <SelectTrigger className="w-32" data-testid="select-order-status">
                      <SelectValue placeholder="全部状态" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部状态</SelectItem>
                      <SelectItem value="pending">待处理</SelectItem>
                      <SelectItem value="approved">已确认</SelectItem>
                      <SelectItem value="rejected">已拒绝</SelectItem>
                    </SelectContent>
                  </Select>

                  <div className="flex items-center space-x-2">
                    <Input
                      type="date"
                      value={filters.dateFrom}
                      onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value, orderPage: 1 }))}
                      className="w-36"
                      data-testid="input-date-from"
                    />
                    <span className="text-muted-foreground">至</span>
                    <Input
                      type="date"
                      value={filters.dateTo}
                      onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value, orderPage: 1 }))}
                      className="w-36"
                      data-testid="input-date-to"
                    />
                  </div>
                </div>
              </div>
            </CardHeader>
            
            <CardContent>
              {ordersLoading ? (
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
                          <TableRow key={order.id} data-testid={`customer-order-row-${order.id}`}>
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
                                  data-testid={`button-view-order-${order.id}`}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                {order.status === 'pending' && (
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    onClick={() => handleQuickApprove(order.id)}
                                    disabled={isProcessing}
                                    className="text-green-600 hover:text-green-500"
                                    data-testid={`button-approve-order-${order.id}`}
                                  >
                                    <CheckCircle className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  
                  {/* Orders Pagination */}
                  {ordersData.total > 10 && (
                    <div className="flex items-center justify-between mt-4">
                      <p className="text-sm text-muted-foreground" data-testid="text-orders-pagination-info">
                        显示 {((filters.orderPage - 1) * 10) + 1}-{Math.min(filters.orderPage * 10, ordersData.total)} 条，共 {ordersData.total} 条记录
                      </p>
                      <div className="flex items-center space-x-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setFilters(prev => ({ ...prev, orderPage: Math.max(1, prev.orderPage - 1) }))}
                          disabled={filters.orderPage <= 1 || ordersLoading}
                          data-testid="button-prev-orders"
                        >
                          <ChevronLeft className="h-4 w-4" />
                          上一页
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setFilters(prev => ({ ...prev, orderPage: prev.orderPage + 1 }))}
                          disabled={filters.orderPage >= Math.ceil(ordersData.total / 10) || ordersLoading}
                          data-testid="button-next-orders"
                        >
                          下一页
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground" data-testid="text-no-orders">
                    {filters.orderType !== "all" || filters.orderStatus !== "all" || filters.dateFrom || filters.dateTo
                      ? "未找到符合条件的订单"
                      : "该客户暂无订单"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Order Details Modal */}
      {selectedOrder && (
        <OrderDetailsModal
          order={selectedOrder}
          open={isOrderModalOpen}
          onOpenChange={(open) => !open && closeOrderDetails()}
          onApprove={handleOrderApprove}
          onReject={handleOrderReject}
          onModifyAndApprove={handleOrderModifyAndApprove}
          isProcessing={isProcessing}
        />
      )}
    </div>
  );
}