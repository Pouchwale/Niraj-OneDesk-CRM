import { useNavigate } from 'react-router-dom';
import { LogOut, Moon, Sun, User as UserIcon } from 'lucide-react';
import { toast } from 'sonner';

import { ROLE_LABEL } from '@/lib/users/roles';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/features/auth/AuthContext';
import { useTheme } from '@/features/theme/ThemeContext';
import { getInitials, cn } from '@/lib/utils';

/**
 * Account menu in the header: identity, theme, and sign out.
 *
 * Signing out clears the stored session, which drops ProtectedRoute back to the
 * login page; the explicit navigate keeps /login out of the history stack.
 */
export function UserMenu() {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  if (!user) return null;

  // Awaited: the cookie has to be gone before the app looks at the session
  // again, or a re-check in flight can put the person straight back in.
  const handleSignOut = async () => {
    await signOut();
    toast.success('Signed out');
    navigate('/login', { replace: true });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className={cn(
            'flex items-center gap-2 rounded-full p-1 pr-2 transition-colors',
            'hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          )}
        >
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {getInitials(user.full_name)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden sm:block text-left">
            <span className="block text-sm font-medium text-foreground leading-none mb-1">
              {user.full_name}
            </span>
            <span className="block text-xs text-muted-foreground leading-none">
              {ROLE_LABEL[user.role]}
            </span>
          </span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{user.full_name}</p>
            <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem disabled>
          <UserIcon className="mr-2 h-4 w-4" />
          {/* Capitalize only the role, not every word in the sentence. */}
          <span>Signed in as {ROLE_LABEL[user.role]}</span>
        </DropdownMenuItem>

        <DropdownMenuItem onSelect={toggleTheme}>
          {theme === 'dark' ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onSelect={handleSignOut}
          className="text-destructive focus:text-destructive focus:bg-destructive/10"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
