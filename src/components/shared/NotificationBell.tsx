import React, { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { seesAllAccounts } from '@/lib/users/roles';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { getNotifications, markAsRead, markAllAsRead, AppNotification } from '@/lib/notifications';
import { subscribeToDemoStore } from '@/lib/demo-companies';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

export const NotificationBell = () => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;

    const fetchNotifications = async () => {
      const seesEverything = seesAllAccounts(user.role);
      const notifs = await getNotifications(user.id, seesEverything);
      setNotifications(notifs);
    };

    fetchNotifications();
    const intervalId = setInterval(fetchNotifications, 60000); // Poll every 60s
    // A message from the team leader arrives with the next server read; show
    // it then, rather than up to a minute later.
    const unsubscribe = subscribeToDemoStore(() => {
      fetchNotifications();
    });

    return () => {
      clearInterval(intervalId);
      unsubscribe();
    };
  }, [user]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleNotificationClick = async (notification: AppNotification) => {
    if (!user) return;
    await markAsRead(notification.id, user.id);
    setNotifications(prev =>
      prev.map(n => (n.id === notification.id ? { ...n, read: true } : n))
    );

    setIsOpen(false);

    if (notification.linkUrl) {
      navigate(notification.linkUrl);
    }
  };

  const handleMarkAllRead = async () => {
    if (!user) return;
    await markAllAsRead(notifications.map(n => n.id), user.id);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const getIconColor = (type: AppNotification['type']) => {
    switch (type) {
      case 'error': return 'text-destructive';
      case 'warning': return 'text-warning';
      case 'success': return 'text-success';
      default: return 'text-primary';
    }
  };

  const getBgColor = (type: AppNotification['type']) => {
    switch (type) {
      case 'error': return 'bg-destructive/10';
      case 'warning': return 'bg-warning/10';
      case 'success': return 'bg-success/10';
      default: return 'bg-primary/10';
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        >
          <Bell size={20} />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground ring-2 ring-background">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h4 className="font-semibold text-sm">Notifications</h4>
          {unreadCount > 0 && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {unreadCount} unread
              </Badge>
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Mark all read
              </button>
            </div>
          )}
        </div>
        
        <ScrollArea className="max-h-[300px]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center px-4">
              <Bell className="h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-sm font-medium text-foreground">All caught up!</p>
              <p className="text-xs text-muted-foreground mt-1">
                You have no new notifications right now.
              </p>
            </div>
          ) : (
            <div className="flex flex-col divide-y">
              {notifications.map((notification) => (
                <button
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={cn(
                    "flex flex-col items-start gap-1 p-4 text-left hover:bg-muted/50 transition-colors",
                    !notification.read ? "bg-muted/20" : ""
                  )}
                >
                  <div className="flex w-full items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className={cn("mt-0.5 h-2 w-2 shrink-0 rounded-full", getIconColor(notification.type), getBgColor(notification.type))} />
                      <span className="text-sm font-medium leading-none">
                        {notification.title}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">
                      {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 ml-4">
                    {notification.message}
                  </p>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};
