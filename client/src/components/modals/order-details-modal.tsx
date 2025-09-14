import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { CheckCircle, XCircle, Edit3, X, User, Calendar, Hash, DollarSign, FileText } from "lucide-react";

interface OrderDetailsModalProps {
  order: any; // Order with telegramUser relation
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove?: (orderId: string) => void;
  onReject?: (orderId: string, rejectionReason: string) => void;
  onModifyAndApprove?: (orderId: string, modifiedContent: string) => void;
  isProcessing?: boolean;
}

type ModalMode = 'view' | 'reject' | 'modify';

export function OrderDetailsModal({ 
  order, 
  open, 
  onOpenChange, 
  onApprove,
  onReject,
  onModifyAndApprove,
  isProcessing = false 
}: OrderDetailsModalProps) {
  const [mode, setMode] = useState<ModalMode>('view');
  const [rejectionReason, setRejectionReason] = useState("");
  const [modifiedContent, setModifiedContent] = useState("");
  const { toast } = useToast();

  // Reset state when modal opens/closes or order changes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setMode('view');
      setRejectionReason("");
      setModifiedContent("");
    } else if (order) {
      // Pre-fill modification content with original content when opening
      setModifiedContent(order.originalContent || order.description || "");
    }
    onOpenChange(newOpen);
  };

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
      approved_modified: "bg-blue-100 text-blue-800",
    };
    
    const labels = {
      pending: "待处理",
      approved: "已确认",
      rejected: "已拒绝",
      approved_modified: "已通过（含修改）",
    };

    return (
      <span className={`px-2 py-1 text-xs rounded-full ${styles[status as keyof typeof styles] || styles.pending}`}>
        {labels[status as keyof typeof labels] || status}
      </span>
    );
  };

  const getTypeLabel = (type: string) => {
    const labels = {
      deposit: "入款报备",
      withdrawal: "出款报备", 
      refund: "退款报备",
    };
    return labels[type as keyof typeof labels] || type;
  };

  const handleApprove = () => {
    if (onApprove && order) {
      onApprove(order.id);
      handleOpenChange(false);
    }
  };

  const handleRejectSubmit = () => {
    if (!rejectionReason.trim()) {
      toast({
        title: "错误",
        description: "请输入拒绝理由",
        variant: "destructive",
      });
      return;
    }

    if (onReject && order) {
      onReject(order.id, rejectionReason.trim());
      handleOpenChange(false);
    }
  };

  const handleModifySubmit = () => {
    if (!modifiedContent.trim()) {
      toast({
        title: "错误",
        description: "请输入修改后的内容",
        variant: "destructive",
      });
      return;
    }

    if (onModifyAndApprove && order) {
      onModifyAndApprove(order.id, modifiedContent.trim());
      handleOpenChange(false);
    }
  };

  if (!order) {
    return null;
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('zh-CN');
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="modal-order-details">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2" data-testid="text-modal-title">
              <span className="text-2xl">{getOrderTypeIcon(order.type)}</span>
              订单详情 - {order.orderNumber}
            </DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleOpenChange(false)}
              data-testid="button-close-modal"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* 订单基本信息 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Hash className="w-4 h-4" />
                订单号
              </div>
              <p className="font-medium" data-testid="text-order-number">{order.orderNumber}</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <FileText className="w-4 h-4" />
                类型
              </div>
              <Badge variant="outline" data-testid="badge-order-type">
                {getTypeLabel(order.type)}
              </Badge>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <DollarSign className="w-4 h-4" />
                金额
              </div>
              <p className="font-medium text-lg" data-testid="text-order-amount">{order.amount}</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                状态
              </div>
              <div data-testid="badge-order-status">
                {getStatusBadge(order.status)}
              </div>
            </div>
          </div>

          <Separator />

          {/* 员工信息 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <User className="w-4 h-4" />
              提交员工
            </div>
            <div className="flex items-center gap-4">
              <p className="font-medium" data-testid="text-employee-name">
                {order.telegramUser?.firstName || '未知'} {order.telegramUser?.lastName || ''}
              </p>
              {order.telegramUser?.username && (
                <p className="text-muted-foreground" data-testid="text-employee-username">
                  @{order.telegramUser.username}
                </p>
              )}
            </div>
          </div>

          <Separator />

          {/* 时间信息 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Calendar className="w-4 h-4" />
                提交时间
              </div>
              <p data-testid="text-created-at">{formatDate(order.createdAt)}</p>
            </div>

            {order.approvedAt && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Calendar className="w-4 h-4" />
                  审批时间
                </div>
                <p data-testid="text-approved-at">{formatDate(order.approvedAt)}</p>
              </div>
            )}
          </div>

          <Separator />

          {/* 订单内容 */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <FileText className="w-4 h-4" />
              {mode === 'modify' ? '修改内容' : '订单内容'}
            </div>
            
            {mode === 'view' && (
              <div className="bg-muted/50 p-4 rounded-lg border">
                <p className="whitespace-pre-wrap" data-testid="text-order-content">
                  {order.originalContent || order.description || '无内容'}
                </p>
              </div>
            )}

            {mode === 'modify' && (
              <div className="space-y-3">
                <Textarea
                  value={modifiedContent}
                  onChange={(e) => setModifiedContent(e.target.value)}
                  placeholder="请输入修改后的内容..."
                  rows={8}
                  className="resize-none"
                  data-testid="textarea-modified-content"
                />
                <p className="text-xs text-muted-foreground">
                  💡 修改后订单将自动通过审批，原始内容将被保留以供对比
                </p>
              </div>
            )}

            {mode === 'reject' && (
              <div className="space-y-3">
                <div className="bg-muted/50 p-4 rounded-lg border">
                  <p className="whitespace-pre-wrap text-sm">
                    {order.originalContent || order.description || '无内容'}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rejection-reason">拒绝理由 *</Label>
                  <Textarea
                    id="rejection-reason"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="请输入拒绝理由..."
                    rows={3}
                    className="resize-none"
                    data-testid="textarea-rejection-reason"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 修改历史 */}
          {order.isModified && order.modifiedContent && mode === 'view' && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Edit3 className="w-4 h-4" />
                  修改后内容
                </div>
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <p className="whitespace-pre-wrap" data-testid="text-modified-content">
                    {order.modifiedContent}
                  </p>
                </div>
                {order.modificationTime && (
                  <p className="text-xs text-muted-foreground">
                    修改时间：{formatDate(order.modificationTime)}
                  </p>
                )}
              </div>
            </>
          )}

          {/* 拒绝理由 */}
          {order.rejectionReason && mode === 'view' && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <XCircle className="w-4 h-4" />
                  拒绝理由
                </div>
                <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                  <p className="whitespace-pre-wrap" data-testid="text-rejection-reason">
                    {order.rejectionReason}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
          {mode === 'view' && (
            <>
              {order.status === 'pending' && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setMode('reject')}
                    disabled={isProcessing}
                    data-testid="button-switch-reject"
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    拒绝
                  </Button>
                  
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setMode('modify')}
                    disabled={isProcessing}
                    data-testid="button-switch-modify"
                  >
                    <Edit3 className="w-4 h-4 mr-2" />
                    修改并通过
                  </Button>
                  
                  <Button
                    type="button"
                    onClick={handleApprove}
                    disabled={isProcessing}
                    data-testid="button-approve"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    确认通过
                  </Button>
                </>
              )}
              
              {order.status !== 'pending' && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  data-testid="button-close"
                >
                  关闭
                </Button>
              )}
            </>
          )}

          {mode === 'reject' && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setMode('view')}
                disabled={isProcessing}
                data-testid="button-cancel-reject"
              >
                取消
              </Button>
              
              <Button
                type="button"
                variant="destructive"
                onClick={handleRejectSubmit}
                disabled={isProcessing || !rejectionReason.trim()}
                data-testid="button-confirm-reject"
              >
                <XCircle className="w-4 h-4 mr-2" />
                确认拒绝
              </Button>
            </>
          )}

          {mode === 'modify' && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setMode('view')}
                disabled={isProcessing}
                data-testid="button-cancel-modify"
              >
                取消
              </Button>
              
              <Button
                type="button"
                onClick={handleModifySubmit}
                disabled={isProcessing || !modifiedContent.trim()}
                data-testid="button-confirm-modify"
              >
                <Edit3 className="w-4 h-4 mr-2" />
                修改并通过
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}