import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Download, ExternalLink } from "lucide-react";
import { Link } from "wouter";

interface TokenChangeConfirmationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isProcessing?: boolean;
}

export function TokenChangeConfirmationModal({ 
  open, 
  onOpenChange, 
  onConfirm, 
  isProcessing = false 
}: TokenChangeConfirmationModalProps) {
  const handleConfirm = () => {
    onConfirm();
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]" data-testid="dialog-token-change-confirmation">
        <DialogHeader>
          <DialogTitle className="flex items-center text-orange-600">
            <AlertTriangle className="w-5 h-5 mr-2" />
            确认更换机器人Token
          </DialogTitle>
          <DialogDescription className="text-left">
            更换机器人Token将会发生以下操作：
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
            <h4 className="font-semibold text-orange-800 dark:text-orange-200 mb-2">将会清除的数据：</h4>
            <ul className="text-sm text-orange-700 dark:text-orange-300 space-y-1">
              <li>• 所有员工用户数据</li>
              <li>• 所有订单记录</li>
              <li>• 所有管理员群聊配置</li>
            </ul>
          </div>
          
          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">将会保留的数据：</h4>
            <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
              <li>• 系统配置和设置</li>
              <li>• 报告模板</li>
              <li>• 键盘按钮配置</li>
            </ul>
          </div>
          
          <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <div className="flex items-start">
              <Download className="w-4 h-4 mr-2 mt-0.5 text-yellow-600" />
              <div>
                <h4 className="font-semibold text-yellow-800 dark:text-yellow-200">建议先备份数据</h4>
                <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                  建议在更换Token前，先到设置页面导出当前数据作为备份。
                </p>
                <Link to="/settings" className="inline-flex items-center text-sm text-yellow-600 hover:text-yellow-700 mt-2">
                  前往设置页面 <ExternalLink className="w-3 h-3 ml-1" />
                </Link>
              </div>
            </div>
          </div>
          
          <div className="flex justify-end space-x-3 pt-4">
            <Button 
              variant="outline" 
              onClick={handleCancel}
              disabled={isProcessing}
              data-testid="button-cancel-token-change"
            >
              取消
            </Button>
            <Button 
              variant="destructive"
              onClick={handleConfirm}
              disabled={isProcessing}
              data-testid="button-confirm-token-change"
            >
              {isProcessing ? "处理中..." : "确认更换"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}