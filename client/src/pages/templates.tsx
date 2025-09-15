import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AddTemplateModal } from "@/components/modals/add-template-modal";
import { EditTemplateModal } from "@/components/modals/edit-template-modal";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Plus, FileText, Edit, Trash2 } from "lucide-react";
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

export default function Templates() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<any>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: templates, isLoading } = useQuery({
    queryKey: ["/api/templates"],
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      await apiRequest("DELETE", `/api/templates/${templateId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      toast({
        title: "成功",
        description: "模板已删除",
      });
      setShowDeleteDialog(false);
      setTemplateToDelete(null);
    },
    onError: (error) => {
      toast({
        title: "错误",
        description: "删除失败: " + error.message,
        variant: "destructive",
      });
    },
  });

  const handleEditTemplate = (template: any) => {
    setSelectedTemplate(template);
    setShowEditModal(true);
  };

  const handleDeleteTemplate = (template: any) => {
    setTemplateToDelete(template);
    setShowDeleteDialog(true);
  };

  const confirmDelete = () => {
    if (templateToDelete) {
      deleteTemplateMutation.mutate(templateToDelete.id);
    }
  };

  const getTypeBadge = (type: string) => {
    const variants = {
      deposit: "default" as const,
      withdrawal: "default" as const,
      refund: "default" as const,
    };
    
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

  const getStatusBadge = (isActive: boolean) => {
    return (
      <Badge variant={isActive ? "default" : "secondary"} data-testid={`status-${isActive ? 'active' : 'draft'}`}>
        {isActive ? "启用" : "草稿"}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground" data-testid="text-page-title">报备模板管理</h1>
        <p className="text-muted-foreground">管理和配置报备信息模板</p>
      </div>

      <Card data-testid="card-templates">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle data-testid="text-card-title">模板列表</CardTitle>
            <Button onClick={() => setShowAddModal(true)} data-testid="button-add-template">
              <Plus className="w-4 h-4 mr-2" />
              新建模板
            </Button>
          </div>
        </CardHeader>
        
        <CardContent>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-5 w-16" />
                  </div>
                  <Skeleton className="h-4 w-full mb-4" />
                  <Skeleton className="h-20 w-full mb-4" />
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-3 w-20" />
                    <div className="flex space-x-2">
                      <Skeleton className="h-6 w-12" />
                      <Skeleton className="h-6 w-12" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : templates && Array.isArray(templates) && templates.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {(templates as any[])?.map((template: any) => (
                <div key={template.id} className="border border-border rounded-lg p-4" data-testid={`card-template-${template.id}`}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-medium text-foreground" data-testid={`text-template-name-${template.id}`}>
                      {template.name}
                    </h3>
                    <div className="flex items-center space-x-2">
                      {getTypeBadge(template.type)}
                      {getStatusBadge(template.isActive)}
                    </div>
                  </div>
                  
                  <div className="text-sm text-muted-foreground mb-4">
                    <p>用于{template.type === 'deposit' ? '入款' : template.type === 'withdrawal' ? '出款' : '退款'}报备的标准模板</p>
                  </div>
                  
                  <div className="bg-muted p-3 rounded-md mb-4 text-sm">
                    <pre className="whitespace-pre-wrap text-xs" data-testid={`text-template-content-${template.id}`}>
                      {template.template}
                    </pre>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground" data-testid={`text-updated-${template.id}`}>
                      最后编辑：{new Date(template.updatedAt).toLocaleDateString('zh-CN')}
                    </span>
                    <div className="flex space-x-2">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-primary hover:text-primary/80" 
                        onClick={() => handleEditTemplate(template)}
                        data-testid={`button-edit-${template.id}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-red-600 hover:text-red-500" 
                        onClick={() => handleDeleteTemplate(template)}
                        data-testid={`button-delete-${template.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground mb-4">暂无模板配置</p>
              <Button onClick={() => setShowAddModal(true)} data-testid="button-create-first-template">
                <Plus className="w-4 h-4 mr-2" />
                创建第一个模板
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <AddTemplateModal open={showAddModal} onOpenChange={setShowAddModal} />
      
      {selectedTemplate && (
        <EditTemplateModal 
          open={showEditModal} 
          onOpenChange={setShowEditModal}
          template={selectedTemplate}
          onTemplateUpdated={() => {
            setSelectedTemplate(null);
            setShowEditModal(false);
          }}
        />
      )}

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent data-testid="dialog-delete-template">
          <AlertDialogHeader>
            <AlertDialogTitle>删除模板</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除模板 "{templateToDelete?.name}" 吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">取消</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              disabled={deleteTemplateMutation.isPending}
              data-testid="button-confirm-delete"
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteTemplateMutation.isPending ? "删除中..." : "删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
