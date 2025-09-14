import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AddUserModal } from "@/components/modals/add-user-modal";
import { Plus, Edit, Ban, Users as UsersIcon } from "lucide-react";

export default function Users() {
  const [roleFilter, setRoleFilter] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);

  const { data: users, isLoading } = useQuery({
    queryKey: ["/api/telegram-users"],
  });

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
        {isActive ? "在线" : "禁用"}
      </Badge>
    );
  };

  const filteredUsers = Array.isArray(users) ? users.filter((user: any) => 
    !roleFilter || user.role === roleFilter
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
                  <SelectItem value="">全部角色</SelectItem>
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
                        <div>
                          <div className="text-sm text-foreground" data-testid={`text-username-${user.id}`}>
                            {user.username ? `@${user.username}` : '未设置'}
                          </div>
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
                            className="text-red-600 hover:text-red-500"
                            data-testid={`button-ban-${user.id}`}
                          >
                            <Ban className="h-4 w-4" />
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
    </div>
  );
}
