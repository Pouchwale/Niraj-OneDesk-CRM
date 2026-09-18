import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Settings, Users, History, Save, Info } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { GlassCard } from '@/components/shared/GlassCard';
import { EmptyState } from '@/components/shared/EmptyState';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAdminSettings } from './hooks/useAdminSettings';
import { getRoster, useAuth } from '@/features/auth/AuthContext';
import { ROLE_LABEL } from '@/lib/users/roles';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { UploadHistoryTab } from '@/features/companies/UploadHistoryTab';
import { CoordinatorAliasesTab } from './CoordinatorAliasesTab';
import { OtifImportHistory } from './OtifImportHistory';

export function SettingsPage() {
  const { isAdmin } = useAuth();
  const { settings, updateSetting, isLoading } = useAdminSettings();
  const [threshold, setThreshold] = useState(settings.red_status_pending_threshold);
  const [buckets, setBuckets] = useState(settings.delay_bucket_boundaries);

  const handleSaveThreshold = () => {
    updateSetting('red_status_pending_threshold', threshold);
  };

  const handleSaveBuckets = () => {
    updateSetting('delay_bucket_boundaries', buckets);
  };

  const updateBucket = (index: number, value: number) => {
    const newBuckets = [...buckets] as [number, number, number];
    newBuckets[index] = value;
    setBuckets(newBuckets);
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Settings" 
        description="Manage application configuration and team members"
        icon={<Settings className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />}
      />

      <Tabs defaultValue="thresholds" className="space-y-6">
        <TabsList className="bg-muted/50 border border-border">
          <TabsTrigger value="thresholds" className="data-[state=active]:bg-indigo-500/20 data-[state=active]:text-indigo-700 dark:data-[state=active]:text-indigo-300">
            <Settings className="w-4 h-4 mr-2" />
            Thresholds
          </TabsTrigger>
          <TabsTrigger value="team" className="data-[state=active]:bg-indigo-500/20 data-[state=active]:text-indigo-700 dark:data-[state=active]:text-indigo-300">
            <Users className="w-4 h-4 mr-2" />
            Team Management
          </TabsTrigger>
          <TabsTrigger value="aliases" className="data-[state=active]:bg-indigo-500/20 data-[state=active]:text-indigo-700 dark:data-[state=active]:text-indigo-300">
            <Users className="w-4 h-4 mr-2" />
            Coordinator Aliases
          </TabsTrigger>
          <TabsTrigger value="history" className="data-[state=active]:bg-indigo-500/20 data-[state=active]:text-indigo-700 dark:data-[state=active]:text-indigo-300">
            <History className="w-4 h-4 mr-2" />
            Import History
          </TabsTrigger>
          <TabsTrigger value="uploads" className="data-[state=active]:bg-indigo-500/20 data-[state=active]:text-indigo-700 dark:data-[state=active]:text-indigo-300">
            <History className="w-4 h-4 mr-2" />
            Upload History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="thresholds" className="space-y-6 outline-none">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <GlassCard className="p-6 space-y-6">
              <div>
                <h3 className="text-lg font-medium text-foreground mb-2">Red Status Threshold</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  When a coordinator has 0 orders and pending work ≥ this value, their status turns red.
                </p>
                <div className="flex items-end gap-4 max-w-sm">
                  <div className="space-y-2 flex-1">
                    <Label htmlFor="threshold">Pending Work Threshold</Label>
                    <Input 
                      id="threshold" 
                      type="number" 
                      value={threshold}
                      onChange={(e) => setThreshold(Number(e.target.value))}
                      className="bg-muted/50"
                    />
                  </div>
                  <Button onClick={handleSaveThreshold} disabled={isLoading} className="bg-indigo-600 hover:bg-indigo-700">
                    <Save className="w-4 h-4 mr-2" />
                    Save
                  </Button>
                </div>
              </div>

              <div className="h-px bg-border w-full my-6" />

              <div>
                <h3 className="text-lg font-medium text-foreground mb-2">Delay Bucket Boundaries</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Define the day thresholds for the delay buckets.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 max-w-2xl">
                  <div className="space-y-2">
                    <Label>Boundary 1 (Slightly Late max)</Label>
                    <Input 
                      type="number" 
                      value={buckets[0]}
                      onChange={(e) => updateBucket(0, Number(e.target.value))}
                      className="bg-muted/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Boundary 2 (Late max)</Label>
                    <Input 
                      type="number" 
                      value={buckets[1]}
                      onChange={(e) => updateBucket(1, Number(e.target.value))}
                      className="bg-muted/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Boundary 3 (Very Late max)</Label>
                    <Input 
                      type="number" 
                      value={buckets[2]}
                      onChange={(e) => updateBucket(2, Number(e.target.value))}
                      className="bg-muted/50"
                    />
                  </div>
                </div>

                <div className="bg-muted/50 rounded-lg p-4 mb-6 border border-border">
                  <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                    <Info className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    Resulting Buckets Preview
                  </h4>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    <li>0 Days → <span className="text-emerald-700 dark:text-emerald-400">On-Time</span></li>
                    <li>1-{buckets[0]} Days → <span className="text-amber-700 dark:text-amber-400">Slightly Late</span></li>
                    <li>{buckets[0] + 1}-{buckets[1]} Days → <span className="text-orange-700 dark:text-orange-400">Late</span></li>
                    <li>{buckets[1] + 1}-{buckets[2]} Days → <span className="text-red-600 dark:text-red-400">Very Late</span></li>
                    <li>{buckets[2] + 1}+ Days → <span className="text-rose-500 font-medium">Critical</span></li>
                  </ul>
                </div>

                <Button onClick={handleSaveBuckets} disabled={isLoading} className="bg-indigo-600 hover:bg-indigo-700">
                  <Save className="w-4 h-4 mr-2" />
                  Save Boundaries
                </Button>
              </div>
            </GlassCard>
          </motion.div>
        </TabsContent>

        <TabsContent value="team" className="outline-none">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <GlassCard className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-medium">Team Members</h3>
                  <p className="text-sm text-muted-foreground">Everyone with an account. Roles and credentials are managed in the admin panel.</p>
                </div>
                {isAdmin && (
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/admin/users">Manage users</Link>
                  </Button>
                )}
              </div>

              <div className="border border-border rounded-md overflow-hidden bg-muted/30">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead>User</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Relation Manager</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getRoster().map((profile) => (
                      <TableRow key={profile.id} className="border-border hover:bg-muted/50">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground border border-border">
                              {profile.full_name.split(' ').map(n => n[0]).join('')}
                            </div>
                            <span className="font-medium text-foreground">{profile.full_name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{profile.email}</TableCell>
                        <TableCell>
                          <Badge 
                            variant="outline" 
                            className={cn(
                              profile.role === 'admin'
                                ? "bg-violet-500/10 text-violet-500 border-violet-500/30"
                                : profile.role === 'team_leader'
                                  ? "bg-indigo-500/10 text-indigo-500 border-indigo-500/30"
                                  : "bg-muted text-muted-foreground border-border"
                            )}
                          >
                            {ROLE_LABEL[profile.role]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {profile.relation_manager_name ? profile.relation_manager_name : <span className="text-muted-foreground/50">-</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </GlassCard>
          </motion.div>
        </TabsContent>

        <TabsContent value="history" className="outline-none">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <GlassCard className="p-6">
              <div className="mb-6">
                <h3 className="text-lg font-medium">Import History</h3>
                <p className="text-sm text-muted-foreground">What has been loaded into OTIF Analytics, and the reports saved there.</p>
              </div>
              <OtifImportHistory />
            </GlassCard>
          </motion.div>
        </TabsContent>

        <TabsContent value="aliases" className="outline-none">
          <CoordinatorAliasesTab />
        </TabsContent>

        <TabsContent value="uploads" className="outline-none">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <UploadHistoryTab />
          </motion.div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
