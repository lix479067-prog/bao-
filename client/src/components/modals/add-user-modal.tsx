import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { X } from "lucide-react";

interface AddUserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddUserModal({ open, onOpenChange }: AddUserModalProps) {
  const [formData, setFormData] = useState({
    telegramId: "",
    username: "",
    firstName: "",
    lastName: "",
    role: "employee",
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createUserMutation = useMutation({
    mutationFn: async (userData: any) => {
      await apiRequest("POST", "/api/telegram-users", userData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/telegram-users"] });
      toast({
        title: "成功",
        description: "用户已添加",
      });
      onOpenChange(false);
      setFormData({
        telegramId: "",
        username: "",
        firstName: "",
        lastName: "",
        role: "employee",
      });
    },
    onError: (error) => {
      toast({
        title: "错误",
        description: "添加失败: " + error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.telegramId || !formData.firstName) {
      toast({
        title: "错误",
        description: "请填写必填字段",
        variant: "destructive",
      });
      return;
    }

    createUserMutation.mutate(formData);
  };

  const handleClose = () => {
    onOpenChange(false);
    setFormData({
      telegramId: "",
      username: "",
      firstName: "",
      lastName: "",
      role: "employee",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="modal-add-user">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle data-testid="text-modal-title">添加新用户</DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              data-testid="button-close-modal"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">用户名 *</Label>
            <Input
              id="firstName"
              value={formData.firstName}
              onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
              placeholder="请输入用户名"
              required
              data-testid="input-first-name"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="lastName">姓氏</Label>
            <Input
              id="lastName"
              value={formData.lastName}
              onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
              placeholder="请输入姓氏（可选）"
              data-testid="input-last-name"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="username">Telegram用户名</Label>
            <Input
              id="username"
              value={formData.username}
              onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
              placeholder="@username"
              data-testid="input-username"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="telegramId">Telegram UID *</Label>
            <Input
              id="telegramId"
              value={formData.telegramId}
              onChange={(e) => setFormData(prev => ({ ...prev, telegramId: e.target.value }))}
              placeholder="123456789"
              required
              data-testid="input-telegram-id"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="role">角色</Label>
            <Select value={formData.role} onValueChange={(value) => setFormData(prev => ({ ...prev, role: value }))}>
              <SelectTrigger data-testid="select-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="employee">员工</SelectItem>
                <SelectItem value="admin">管理员</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="outline" onClick={handleClose} data-testid="button-cancel">
              取消
            </Button>
            <Button 
              type="submit" 
              disabled={createUserMutation.isPending}
              data-testid="button-submit"
            >
              添加用户
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
