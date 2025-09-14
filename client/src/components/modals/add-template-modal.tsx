import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { X } from "lucide-react";

interface AddTemplateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddTemplateModal({ open, onOpenChange }: AddTemplateModalProps) {
  const [formData, setFormData] = useState({
    name: "",
    type: "",
    template: "",
    isActive: true,
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createTemplateMutation = useMutation({
    mutationFn: async (templateData: any) => {
      await apiRequest("POST", "/api/templates", templateData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      toast({
        title: "成功",
        description: "模板已创建",
      });
      onOpenChange(false);
      setFormData({
        name: "",
        type: "",
        template: "",
        isActive: true,
      });
    },
    onError: (error) => {
      toast({
        title: "错误",
        description: "创建失败: " + error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.type || !formData.template) {
      toast({
        title: "错误",
        description: "请填写所有必填字段",
        variant: "destructive",
      });
      return;
    }

    createTemplateMutation.mutate(formData);
  };

  const handleClose = () => {
    onOpenChange(false);
    setFormData({
      name: "",
      type: "",
      template: "",
      isActive: true,
    });
  };

  const defaultTemplates = {
    deposit: `报备类型：入款
用户信息：{用户名}
金额：{金额}
支付方式：{支付方式}
时间：{时间}
备注：{备注}`,
    withdrawal: `报备类型：出款
用户信息：{用户名}
金额：{金额}
收款方式：{收款方式}
时间：{时间}
备注：{备注}`,
    refund: `报备类型：退款
用户信息：{用户名}
原因：{退款原因}
金额：{金额}
时间：{时间}
备注：{备注}`
  };

  const handleTypeChange = (type: string) => {
    setFormData(prev => ({
      ...prev,
      type,
      template: defaultTemplates[type as keyof typeof defaultTemplates] || ""
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl" data-testid="modal-add-template">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle data-testid="text-modal-title">新建报备模板</DialogTitle>
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">模板名称 *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="请输入模板名称"
                required
                data-testid="input-template-name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="type">报备类型 *</Label>
              <Select value={formData.type} onValueChange={handleTypeChange}>
                <SelectTrigger data-testid="select-template-type">
                  <SelectValue placeholder="选择报备类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deposit">入款报备</SelectItem>
                  <SelectItem value="withdrawal">出款报备</SelectItem>
                  <SelectItem value="refund">退款报备</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="template">模板内容 *</Label>
            <Textarea
              id="template"
              value={formData.template}
              onChange={(e) => setFormData(prev => ({ ...prev, template: e.target.value }))}
              placeholder="请输入模板内容，可以使用占位符如 {用户名}、{金额} 等"
              rows={8}
              required
              data-testid="textarea-template-content"
            />
            <p className="text-xs text-muted-foreground">
              可用占位符：{"{用户名}"}、{"{金额}"}、{"{时间}"}、{"{备注}"} 等
            </p>
          </div>
          
          <div className="flex items-center justify-between p-4 border border-border rounded-lg">
            <div>
              <p className="text-sm font-medium text-foreground">启用模板</p>
              <p className="text-xs text-muted-foreground">创建后立即启用此模板</p>
            </div>
            <Switch
              checked={formData.isActive}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isActive: checked }))}
              data-testid="switch-template-active"
            />
          </div>
          
          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="outline" onClick={handleClose} data-testid="button-cancel">
              取消
            </Button>
            <Button 
              type="submit" 
              disabled={createTemplateMutation.isPending}
              data-testid="button-submit"
            >
              创建模板
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
