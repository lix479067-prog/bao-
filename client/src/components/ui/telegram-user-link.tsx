import { Button } from "@/components/ui/button";
import { MessageCircle, ExternalLink } from "lucide-react";

interface TelegramUser {
  username?: string;
  telegramId?: string;
  firstName?: string;
  lastName?: string;
}

interface TelegramUserLinkProps {
  user: TelegramUser;
  variant?: "link" | "button" | "inline";
  className?: string;
}

export function TelegramUserLink({ user, variant = "link", className = "" }: TelegramUserLinkProps) {
  const handleTelegramContact = () => {
    if (user.username) {
      // 优先使用username链接 - 更可靠
      const telegramUrl = `https://t.me/${user.username}`;
      window.open(telegramUrl, '_blank', 'noopener,noreferrer');
    } else if (user.telegramId) {
      // 备选方案：使用ID链接
      const telegramUrl = `tg://user?id=${user.telegramId}`;
      window.open(telegramUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const displayName = user.firstName || user.username || '未知用户';
  const hasContact = user.username || user.telegramId;

  if (variant === "button") {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={handleTelegramContact}
        disabled={!hasContact}
        className={`text-blue-600 hover:text-blue-800 hover:bg-blue-50 ${className}`}
        data-testid="button-contact-telegram"
        title={hasContact ? `联系 @${user.username || user.telegramId}` : "无法联系"}
      >
        <MessageCircle className="w-4 h-4 mr-1" />
        联系
      </Button>
    );
  }

  if (variant === "inline") {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span className="text-sm text-foreground" data-testid="text-telegram-info">
          {user.username ? `@${user.username}` : '未设置'}
        </span>
        {hasContact && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleTelegramContact}
            className="p-1 h-auto text-blue-600 hover:text-blue-800 hover:bg-blue-50"
            data-testid="button-contact-inline"
            title={`联系 @${user.username || user.telegramId}`}
          >
            <ExternalLink className="w-3 h-3" />
          </Button>
        )}
      </div>
    );
  }

  // variant === "link" (default)
  if (!hasContact) {
    return (
      <span className={`text-muted-foreground ${className}`} data-testid="text-no-contact">
        {user.username ? `@${user.username}` : '未设置'}
      </span>
    );
  }

  return (
    <button
      onClick={handleTelegramContact}
      className={`text-blue-600 hover:text-blue-800 hover:underline cursor-pointer transition-colors ${className}`}
      data-testid="link-telegram-user"
      title={`点击联系 @${user.username || user.telegramId}`}
    >
      @{user.username || user.telegramId}
    </button>
  );
}