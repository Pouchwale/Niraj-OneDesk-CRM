import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Plus, X, Users, AlertCircle } from 'lucide-react';
import { GlassCard } from '@/components/shared/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { getAllCoordinators } from '@/features/auth/AuthContext';
import { getAllAliases, addAlias, removeAlias } from '@/lib/coordinator-aliases';
import type { CoordinatorAlias } from '@/lib/types';
import { toast } from 'sonner';

export function CoordinatorAliasesTab() {
  const coordinators = getAllCoordinators();
  const [aliases, setAliases] = useState<CoordinatorAlias[]>([]);
  const [newAliasText, setNewAliasText] = useState<{ [key: string]: string }>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAliases();
  }, []);

  const loadAliases = async () => {
    setIsLoading(true);
    try {
      const data = await getAllAliases();
      setAliases(data);
    } catch (error) {
      console.error('Failed to load aliases', error);
      toast.error('Failed to load coordinator aliases');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddAlias = async (coordinatorId: string) => {
    const text = newAliasText[coordinatorId]?.trim();
    if (!text) return;

    try {
      const added = await addAlias(coordinatorId, text);
      setAliases(prev => [added, ...prev]);
      setNewAliasText(prev => ({ ...prev, [coordinatorId]: '' }));
      toast.success('Alias added successfully');
    } catch (error: any) {
      toast.error(error.message || 'Failed to add alias');
    }
  };

  const handleRemoveAlias = async (aliasId: string) => {
    try {
      await removeAlias(aliasId);
      setAliases(prev => prev.filter(a => a.id !== aliasId));
      toast.success('Alias removed');
    } catch (error) {
      console.error('Failed to remove alias', error);
      toast.error('Failed to remove alias');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, coordinatorId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddAlias(coordinatorId);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6 outline-none"
    >
      <GlassCard className="p-6">
        <div className="mb-6">
          <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            Coordinator Aliases
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Manage alternative names or misspellings for coordinators used during OTIF data imports.
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
          </div>
        ) : (
          <div className="space-y-4">
            {coordinators.map(coordinator => {
              const coordinatorAliases = aliases.filter(a => a.coordinator_id === coordinator.id);

              return (
                <div key={coordinator.id} className="border border-border rounded-lg p-4 bg-muted/30 flex flex-col md:flex-row md:items-start gap-4">
                  <div className="flex-1 min-w-[200px]">
                    <h4 className="font-medium text-foreground">{coordinator.full_name}</h4>
                    <p className="text-xs text-muted-foreground">{coordinator.email}</p>
                  </div>
                  
                  <div className="flex-1 space-y-3">
                    <div className="flex flex-wrap gap-2 min-h-[28px]">
                      {coordinatorAliases.length > 0 ? (
                        coordinatorAliases.map(alias => (
                          <Badge 
                            key={alias.id} 
                            variant="secondary" 
                            className="bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20 pr-1 hover:bg-indigo-500/20"
                          >
                            {alias.alias_text}
                            <button
                              onClick={() => handleRemoveAlias(alias.id)}
                              className="ml-1 p-0.5 rounded-full hover:bg-indigo-500/30 focus:outline-none"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        ))
                      ) : (
                        <span className="text-sm text-muted-foreground italic flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          No aliases defined
                        </span>
                      )}
                    </div>
                    
                    <div className="flex gap-2">
                      <Input
                        placeholder="Add new alias..."
                        value={newAliasText[coordinator.id] || ''}
                        onChange={(e) => setNewAliasText(prev => ({ ...prev, [coordinator.id]: e.target.value }))}
                        onKeyDown={(e) => handleKeyDown(e, coordinator.id)}
                        className="bg-muted/50 h-8 text-sm"
                      />
                      <Button 
                        size="sm" 
                        onClick={() => handleAddAlias(coordinator.id)}
                        disabled={!newAliasText[coordinator.id]?.trim()}
                        className="bg-indigo-600 hover:bg-indigo-700 h-8"
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Add
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>
    </motion.div>
  );
}
