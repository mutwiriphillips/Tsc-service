'use client';
import { createContext, useContext } from 'react';

export const OfficerContext = createContext(null);
export const useOfficer = () => useContext(OfficerContext);

/** What each role may do in the interface. The API enforces the same rules; this only hides dead ends. */
export function can(officer, action) {
  if (!officer) return false;
  const r = officer.role;
  const map = {
    postTeachers: ['NATIONAL_ADMIN', 'COUNTY_DIRECTOR'],
    manageOfficers: ['NATIONAL_ADMIN', 'COUNTY_DIRECTOR'],
    createSchool: ['NATIONAL_ADMIN', 'COUNTY_DIRECTOR'],
    createTeacher: ['NATIONAL_ADMIN'],
    changeRegistration: ['NATIONAL_ADMIN'],
    seeSensitive: ['NATIONAL_ADMIN', 'COUNTY_DIRECTOR'],
    overrideFlags: ['NATIONAL_ADMIN', 'COUNTY_DIRECTOR'],
    runRules: ['NATIONAL_ADMIN', 'COUNTY_DIRECTOR'],
    editRules: ['NATIONAL_ADMIN'],
    readAudit: ['NATIONAL_ADMIN'],
    submitDocuments: ['NATIONAL_ADMIN', 'COUNTY_DIRECTOR', 'SUBCOUNTY_DIRECTOR', 'CSO', 'HEAD_OF_INSTITUTION'],
    decideDocuments: ['SUBCOUNTY_DIRECTOR', 'COUNTY_DIRECTOR', 'NATIONAL_ADMIN'],
    planVisits: ['CSO'],
    approveVisits: ['SUBCOUNTY_DIRECTOR', 'COUNTY_DIRECTOR'],
    declareVacancy: ['NATIONAL_ADMIN', 'COUNTY_DIRECTOR', 'SUBCOUNTY_DIRECTOR', 'HEAD_OF_INSTITUTION'],
    recordAppraisal: ['HEAD_OF_INSTITUTION', 'SUBCOUNTY_DIRECTOR', 'COUNTY_DIRECTOR', 'NATIONAL_ADMIN'],
    updateFile: ['NATIONAL_ADMIN', 'COUNTY_DIRECTOR', 'SUBCOUNTY_DIRECTOR'],
    handleCorrections: ['NATIONAL_ADMIN', 'COUNTY_DIRECTOR', 'SUBCOUNTY_DIRECTOR'],
    importAppraisals: ['NATIONAL_ADMIN', 'COUNTY_DIRECTOR'],
    importTeachers: ['NATIONAL_ADMIN'],
  };
  return (map[action] || []).includes(r);
}

export function jurisdictionLabel(o) {
  if (!o) return '';
  if (o.role === 'NATIONAL_ADMIN') return 'All counties';
  if (o.region) return `${o.region.name} region`;
  if (o.county) return `${o.county.name} County`;
  if (o.subCounty) return `${o.subCounty.name} Sub-County`;
  if (o.school) return o.school.name;
  if (o.csoAssignments) return `${o.csoAssignments.length} assigned school${o.csoAssignments.length === 1 ? '' : 's'}`;
  return '';
}
