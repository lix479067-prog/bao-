import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AddUserModal } from "@/components/modals/add-user-modal";
import { TelegramUserLink } from "@/components/ui/telegram-user-link";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Plus, Edit, Ban, Users as UsersIcon, CheckCircle, XCircle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Users() {
  const [roleFilter, setRoleFilter] = useState("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: users, isLoading } = useQuery({
    queryKey: ["/api/telegram-users"],
  });

  const updateUserStatusMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      await apiRequest("PATCH", `/api/telegram-users/${userId}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/telegram-users"] });
      toast({
        title: "成功",
        description: selectedUser?.isActive ? "用户已禁用" : "用户已启用",
      });
      setShowStatusDialog(false);
      setSelectedUser(null);
    },
    onError: (error) => {
      toast({
        title: "错误",
        description: "操作失败: " + error.message,
        variant: "destructive",
      });
    },
  });

  const handleToggleUserStatus = (user: any) => {
    setSelectedUser(user);
    setShowStatusDialog(true);
  };

  const confirmStatusChange = () => {
    if (selectedUser) {
      updateUserStatusMutation.mutate({
        userId: selectedUser.id,
        isActive: !selectedUser.isActive
      });
    }
  };

  const getUserInitials = (user: any) => {
    if (user.firstName) {
      return user.firstName.charAt(0).toUpperCase();
    }
    if (user.username) {
      return user.username.charAt(0).toUpperCase();
    }
    return "U";
  };

  const getRoleBadge = (role: string) => {
    const variants = {
      admin: "default" as const,
      employee: "secondary" as const,
    };
    
    const labels = {
      admin: "管理员",
      employee: "员工",
    };

    return (
      <Badge variant={variants[role as keyof typeof variants] || "secondary"} data-testid={`role-${role}`}>
        {labels[role as keyof typeof labels] || role}
      </Badge>
    );
  };

  const getStatusBadge = (isActive: boolean) => {
    return (
      <Badge variant={isActive ? "default" : "destructive"} data-testid={`status-${isActive ? 'active' : 'inactive'}`}>
        <div className={`w-1.5 h-1.5 ${isActive ? 'bg-green-500' : 'bg-red-500'} rounded-full mr-1`}></div>
        {isActive ? "正常" : "禁用"}
      </Badge>
    );
  };

  const filteredUsers = Array.isArray(users) ? users.filter((user: any) => 
    roleFilter === "all" || user.role === roleFilter
  ) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground" data-testid="text-page-title">用户管理</h1>
        <p className="text-muted-foreground">管理Telegram用户和权限设置</p>
      </div>

      <Card data-testid="card-users">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle data-testid="text-card-title">用户列表</CardTitle>
            <div className="flex items-center space-x-4">
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-32" data-testid="select-role-filter">
                  <SelectValue placeholder="全部角色" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部角色</SelectItem>
                  <SelectItem value="admin">管理员</SelectItem>
                  <SelectItem value="employee">员工</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={() => setShowAddModal(true)} data-testid="button-add-user">
                <Plus className="w-4 h-4 mr-2" />
                添加用户
              </Button>
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
          ) : filteredUsers.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>用户信息</TableHead>
                    <TableHead>TG信息</TableHead>
                    <TableHead>角色</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>注册时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user: any) => (
                    <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                      <TableCell>
                        <div className="flex items-center">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback className="bg-primary text-primary-foreground">
                              {getUserInitials(user)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-foreground" data-testid={`text-name-${user.id}`}>
                              {user.firstName || user.username || '未知用户'}
                              {user.lastName && ` ${user.lastName}`}
                            </div>
                            <div className="text-sm text-muted-foreground">ID: {user.id.slice(0, 8)}...</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <TelegramUserLink 
                            user={{
                              username: user.username,
                              telegramId: user.telegramId,
                              firstName: user.firstName
                            }}
                            variant="inline"
                            data-testid={`telegram-link-${user.id}`}
                          />
                          <div className="text-sm text-muted-foreground" data-testid={`text-telegram-id-${user.id}`}>
                            UID: {user.telegramId}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {getRoleBadge(user.role)}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(user.isActive)}
                      </TableCell>
                      <TableCell className="text-muted-foreground" data-testid={`text-created-${user.id}`}>
                        {new Date(user.createdAt).toLocaleDateString('zh-CN')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <Button variant="ghost" size="sm" data-testid={`button-edit-${user.id}`}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className={user.isActive ? "text-red-600 hover:text-red-500" : "text-green-600 hover:text-green-500"}
                            onClick={() => handleToggleUserStatus(user)}
                            data-testid={`button-toggle-status-${user.id}`}
                            title={user.isActive ? "禁用用户" : "启用用户"}
                          >
                            {user.isActive ? <Ban className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <UsersIcon className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">暂无用户记录</p>
            </div>
          )}
        </CardContent>
      </Card>

      <AddUserModal open={showAddModal} onOpenChange={setShowAddModal} />
      
      <AlertDialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <AlertDialogContent data-testid="dialog-toggle-user-status">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selectedUser?.isActive ? "禁用用户" : "启用用户"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedUser?.isActive 
                ? `确定要禁用用户 "${selectedUser?.firstName || selectedUser?.username || '未知用户'}" 吗？禁用后该用户将无法提交报备订单，所有提交将被机器人自动退回。`
                : `确定要启用用户 "${selectedUser?.firstName || selectedUser?.username || '未知用户'}" 吗？启用后该用户可以正常提交报备订单。`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-status-change">取消</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmStatusChange}
              disabled={updateUserStatusMutation.isPending}
              data-testid="button-confirm-status-change"
              className={selectedUser?.isActive ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"}
            >
              {updateUserStatusMutation.isPending 
                ? (selectedUser?.isActive ? "禁用中..." : "启用中...") 
                : (selectedUser?.isActive ? "确认禁用" : "确认启用")
              }
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
