/**
 * The accounts the app ships with.
 *
 * Shared so the server can seed its account file and the browser can name a
 * coordinator before the roster has been fetched. Passwords are deliberately
 * not here: they live on the server only (see server/modules/auth/seed.ts),
 * because anything in this file is also in the browser bundle.
 */

import type { AuthDesk, AuthModule, AuthRole } from './auth'

export interface SeedProfile {
  id: string
  username: string
  email: string
  full_name: string
  role: AuthRole
  module: AuthModule
  relation_manager_name: string | null
  desk?: AuthDesk
}

export const SEED_PROFILES: SeedProfile[] = [
  { id: 'admin-0', username: 'admin', email: 'admin@gp3.com', full_name: 'System Administrator', role: 'admin', module: null, relation_manager_name: null },
  { id: 'admin-1', username: 'niki', email: 'niki@gp3.com', full_name: 'Niki Patel', role: 'team_leader', module: null, relation_manager_name: 'Niki Patel' },

  /* ===== Team GP3 ===== */
  { id: 'coord-1', username: 'pragati', email: 'pragati@gp3.com', full_name: 'Pragati Patel', role: 'coordinator', module: 'GP3', relation_manager_name: 'Pragati Patel' },
  { id: 'coord-3', username: 'devyani', email: 'devyani@gp3.com', full_name: 'Devyani Vaghela', role: 'coordinator', module: 'GP3', relation_manager_name: 'Devyani Vaghela' },
  { id: 'coord-2', username: 'diya', email: 'diya@gp3.com', full_name: 'Diya Prajapati', role: 'coordinator', module: 'GP3', relation_manager_name: 'Diya Prajapati' },
  // Two people are called Disha, so each needs a username of her own.
  { id: 'coord-8', username: 'disha.chaudhari', email: 'disha.chaudhari@gp3.com', full_name: 'Disha Chaudhari', role: 'coordinator', module: 'GP3', relation_manager_name: 'Disha Chaudhari' },
  { id: 'coord-4', username: 'foram', email: 'foram@gp3.com', full_name: 'Foram Prajapati', role: 'coordinator', module: 'GP3', relation_manager_name: 'Foram Prajapati' },
  { id: 'coord-5', username: 'krupa', email: 'krupa@gp3.com', full_name: 'Krupa Patel', role: 'coordinator', module: 'GP3', relation_manager_name: 'Krupa Patel' },

  /* ===== Team Pouchwale ===== */
  { id: 'coord-9', username: 'vishva', email: 'vishva@gp3.com', full_name: 'Vishva Vyas', role: 'coordinator', module: 'Pouchwale', relation_manager_name: 'Vishva Vyas', desk: 'artworks' },
  { id: 'coord-7', username: 'krina', email: 'krina@gp3.com', full_name: 'Krina Shah', role: 'coordinator', module: 'Pouchwale', relation_manager_name: 'Krina Shah', desk: 'orders' },
  { id: 'coord-6', username: 'aniketa', email: 'aniketa@gp3.com', full_name: 'Aniketa Jadav', role: 'coordinator', module: 'Pouchwale', relation_manager_name: 'Aniketa Jadav' },
  { id: 'coord-10', username: 'disha.acharya', email: 'disha.acharya@gp3.com', full_name: 'Disha Acharya', role: 'coordinator', module: 'Pouchwale', relation_manager_name: 'Disha Acharya', desk: 'updates' },
  { id: 'coord-11', username: 'avani', email: 'avani@gp3.com', full_name: 'Avani Patel', role: 'coordinator', module: 'Pouchwale', relation_manager_name: 'Avani Patel', desk: 'dispatch' },

]
