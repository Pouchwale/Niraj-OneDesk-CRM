/**
 * Festival dates from the Hindu Panchang (checked 6 Nov 2026).
 *
 * Read from Drik Panchang for New Delhi and again for Ahmedabad (identical for
 * every date below except Holi 2026 and Govardhan Puja 2026, which use the
 * Gujarat Government's days), and cross-checked with the Central Government
 * holiday lists for 2026 and 2027, the Gujarat Government's 2026 list, the
 * Tamil Nadu 2026 gazette and Prokerala.
 *
 * Lunar festivals move every year and cannot be worked out reliably in the
 * browser, so only checked dates are listed. A year that is missing shows as
 * "date not confirmed" and the administrator can add it on the Festivals page.
 * Republic Day and Independence Day are fixed and not listed.
 *
 * A festival that runs several days gives [first day, last day].
 * Re-check when published: Gujarat Government 2027 list (expected late
 * Nov 2026), Central Government 2028 list (expected around Jul 2027).
 */

import type { FestivalId } from './festival-data'

export type DateEntry = string | [string, string]

export const PANCHANG_SOURCE = 'Drik Panchang (New Delhi and Ahmedabad), cross-checked with government holiday lists, 6 Nov 2026'
export const PANCHANG_YEARS = [2026, 2027, 2028]

export const PANCHANG_DATES: Partial<Record<FestivalId, Partial<Record<number, DateEntry>>>> = {
  // Gujarat keeps Uttarayan on 14 Jan with Vasi Uttarayan on the 15th.
  makar_sankranti: { 2026: ['2026-01-14', '2026-01-15'], 2027: ['2027-01-14', '2027-01-15'], 2028: ['2028-01-14', '2028-01-15'] },
  pongal: { 2026: '2026-01-15', 2027: '2027-01-15', 2028: '2028-01-15' },
  vasant_panchami: { 2026: '2026-01-23', 2027: '2027-02-11', 2028: '2028-01-31' },
  maha_shivratri: { 2026: '2026-02-15', 2027: '2027-03-06', 2028: '2028-02-23' },
  holika_dahan: { 2026: '2026-03-03', 2027: '2027-03-21', 2028: '2028-03-10' },
  holi: { 2026: '2026-03-04', 2027: '2027-03-22', 2028: '2028-03-11' },
  gudi_padwa: { 2026: '2026-03-19', 2027: '2027-04-07', 2028: '2028-03-27' },
  ugadi: { 2026: '2026-03-19', 2027: '2027-04-07', 2028: '2028-03-27' },
  navreh: { 2026: '2026-03-19', 2027: '2027-04-07', 2028: '2028-03-27' },
  ram_navami: { 2026: '2026-03-26', 2027: '2027-04-15', 2028: '2028-04-03' },
  hanuman_jayanti: { 2026: '2026-04-02', 2027: '2027-04-20', 2028: '2028-04-09' },
  baisakhi: { 2026: '2026-04-14', 2027: '2027-04-14', 2028: '2028-04-13' },
  akshaya_tritiya: { 2026: '2026-04-19', 2027: '2027-05-09', 2028: '2028-04-27' },
  guru_purnima: { 2026: '2026-07-29', 2027: '2027-07-18', 2028: '2028-07-06' },
  raksha_bandhan: { 2026: '2026-08-28', 2027: '2027-08-17', 2028: '2028-08-05' },
  onam: { 2026: '2026-08-26', 2027: '2027-09-12', 2028: '2028-09-01' },
  janmashtami: { 2026: '2026-09-04', 2027: '2027-08-25', 2028: '2028-08-13' },
  ganesh_chaturthi: { 2026: '2026-09-14', 2027: '2027-09-04', 2028: '2028-08-23' },
  // Ghatasthapana to Maha Navami.
  navratri: { 2026: ['2026-10-11', '2026-10-19'], 2027: ['2027-09-30', '2027-10-08'], 2028: ['2028-09-19', '2028-09-26'] },
  dussehra: { 2026: '2026-10-20', 2027: '2027-10-09', 2028: '2028-09-27' },
  karwa_chauth: { 2026: '2026-10-29', 2027: '2027-10-18', 2028: '2028-10-07' },
  dhanteras: { 2026: '2026-11-06', 2027: '2027-10-27', 2028: '2028-10-15' },
  // In 2027 Kali Chaudas night falls on Dhanteras day.
  kali_chaudas: { 2026: '2026-11-07', 2027: '2027-10-27', 2028: '2028-10-16' },
  diwali: { 2026: '2026-11-08', 2027: '2027-10-29', 2028: '2028-10-17' },
  nutan_varsh: { 2026: '2026-11-10', 2027: '2027-10-30', 2028: '2028-10-18' },
  bhai_dooj: { 2026: '2026-11-11', 2027: '2027-10-31', 2028: '2028-10-19' },
  labh_pancham: { 2026: '2026-11-14', 2027: '2027-11-03', 2028: '2028-10-22' },
  chhath_puja: { 2026: '2026-11-15', 2027: '2027-11-04', 2028: '2028-10-23' },
  tulsi_vivah: { 2026: '2026-11-21', 2027: '2027-11-11', 2028: '2028-10-29' },
}

/** Where sources disagree or a date is not yet published: shown beside the date so the administrator can confirm it. */
export const DATE_NOTES: Partial<Record<FestivalId, Partial<Record<number, string>>>> = {
  makar_sankranti: {
    2027: 'The Sankranti moment is on the evening of 14 Jan, so Drik Panchang lists 15 Jan; Gujarat keeps Uttarayan on 14 Jan. Not yet in the Gujarat 2027 list.',
    2028: 'Drik Panchang lists 15 Jan; Gujarat keeps Uttarayan on 14 Jan with Vasi Uttarayan on the 15th.',
  },
  pongal: { 2026: 'Tamil Nadu Government: 15 Jan. Drik Panchang: 14 Jan.' },
  holika_dahan: { 2027: 'Drik Panchang: 21 Mar. Central Government list and Prokerala: 22 Mar.' },
  holi: { 2027: 'Drik Panchang: 22 Mar. The Central Government holiday is 23 Mar. Check Gujarat’s 2027 list for Dhuleti.' },
  navreh: {
    2027: 'Set by the Panchang rule (Chaitra Shukla Pratipada, the same day as Ugadi); no published date yet.',
    2028: 'Set by the Panchang rule (Chaitra Shukla Pratipada, the same day as Ugadi); no published date yet.',
  },
  karwa_chauth: {
    2027: 'Drik Panchang and the Central Government list; Prokerala gives one day later.',
    2028: 'Drik Panchang; Prokerala gives one day later.',
  },
  dhanteras: { 2026: 'Puja and shopping day by Drik Panchang (Delhi and Ahmedabad). The Gujarat Government’s optional holiday is 7 Nov.' },
  nutan_varsh: { 2026: 'Bestu Varas. Govardhan Puja: 9 Nov in Ahmedabad by Drik Panchang, 10 Nov in Delhi.' },
}
