import React, { createContext, useContext, useState, useMemo, useCallback, useEffect } from 'react';
import { computeOtifSummary, type OtifSummary } from '@/lib/demo-data';
import type { PoDelivery } from '@/lib/types';
import { toast } from 'sonner';

export interface OtifFilters {
  category: string | null;
  relationManager: string | null;
  delayBucket: string | null;
}

export interface OtifArchive {
  id: string;
  fileName: string;
  uploadDate: string; // ISO string
  totalPOs: number;
  otifScore: number;
  deliveries: PoDelivery[];
}

interface OtifContextType {
  deliveries: PoDelivery[];
  allDeliveries: PoDelivery[];
  summary: OtifSummary;
  filters: OtifFilters;
  setFilters: React.Dispatch<React.SetStateAction<OtifFilters>>;
  uploadFile: (parsedRows: Partial<PoDelivery>[], fileName: string) => void;
  clearOtifData: () => void;
  activeFileName: string | null;
  isLoading: boolean;
  isUploadedData: boolean;
  archives: OtifArchive[];
  loadArchive: (id: string) => void;
  deleteArchive: (id: string) => void;
  saveToArchive: (fileName: string) => void;
}

const STORAGE_KEY_DELIVERIES = 'coordinator_otif_deliveries';
const STORAGE_KEY_FILENAME = 'coordinator_otif_filename';
const STORAGE_KEY_ARCHIVES = 'coordinator_otif_archives';

const OtifContext = createContext<OtifContextType | undefined>(undefined);

export function OtifProvider({ children }: { children: React.ReactNode }) {
  const [deliveries, setDeliveries] = useState<PoDelivery[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_DELIVERIES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error('Failed to load saved OTIF deliveries from localStorage', e);
    }
    return [];
  });

  const [activeFileName, setActiveFileName] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEY_FILENAME) || null;
  });

  const [archives, setArchives] = useState<OtifArchive[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ARCHIVES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error('Failed to load OTIF archives', e);
    }
    return [];
  });

  const [filters, setFilters] = useState<OtifFilters>({
    category: null,
    relationManager: null,
    delayBucket: null,
  });

  const [isLoading, setIsLoading] = useState(false);

  // Persist current active file
  useEffect(() => {
    if (activeFileName && deliveries.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY_DELIVERIES, JSON.stringify(deliveries));
        localStorage.setItem(STORAGE_KEY_FILENAME, activeFileName);
      } catch (e) {
        console.error('Failed to save OTIF deliveries to localStorage', e);
      }
    }
  }, [deliveries, activeFileName]);

  // Persist archives
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_ARCHIVES, JSON.stringify(archives));
    } catch (e) {
      console.error('Failed to save OTIF archives', e);
    }
  }, [archives]);

  const filteredDeliveries = useMemo(() => {
    return deliveries.filter((d) => {
      if (filters.category && filters.category !== 'All' && d.category !== filters.category) return false;
      if (filters.relationManager && filters.relationManager !== 'All' && d.relation_manager !== filters.relationManager) return false;
      if (filters.delayBucket && filters.delayBucket !== 'All') {
        if (d.delay_bucket !== filters.delayBucket) return false;
      }
      return true;
    });
  }, [deliveries, filters]);

  const summary = useMemo(() => computeOtifSummary(filteredDeliveries), [filteredDeliveries]);

  const uploadFile = useCallback((parsedRows: Partial<PoDelivery>[], fileName: string) => {
    setIsLoading(true);
    const newDeliveries = parsedRows.map((r, i) => ({
      ...r,
      id: r.po_no ? `po-${r.po_no}-${i}` : `po-${Date.now()}-${i}`,
      created_at: new Date().toISOString(),
    })) as PoDelivery[];

    setDeliveries(newDeliveries);
    setActiveFileName(fileName);
    setFilters({ category: null, relationManager: null, delayBucket: null });
    setIsLoading(false);
  }, []);

  const saveToArchive = useCallback((customFileName: string) => {
    if (deliveries.length === 0) {
      toast.error('No data to save');
      return;
    }
    const currentSummary = computeOtifSummary(deliveries);
    const newArchive: OtifArchive = {
      id: `otif-arch-${Date.now()}`,
      fileName: customFileName,
      uploadDate: new Date().toISOString(),
      totalPOs: currentSummary.totalPOs,
      otifScore: currentSummary.otifPercentage,
      deliveries: deliveries
    };
    
    setArchives(prev => {
      const next = [newArchive, ...prev];
      if (next.length > 10) return next.slice(0, 10);
      return next;
    });
    
    toast.success(`Report saved to archive as ${customFileName}`);
  }, [deliveries]);

  const loadArchive = useCallback((id: string) => {
    const archive = archives.find(a => a.id === id);
    if (archive) {
      setDeliveries(archive.deliveries);
      setActiveFileName(archive.fileName);
      setFilters({ category: null, relationManager: null, delayBucket: null });
      toast.success(`Loaded archived report: ${archive.fileName}`);
    }
  }, [archives]);

  const deleteArchive = useCallback((id: string) => {
    setArchives(prev => prev.filter(a => a.id !== id));
    toast.success('Archive deleted successfully');
  }, []);

  const clearOtifData = useCallback(() => {
    setDeliveries([]);
    setActiveFileName(null);
    setFilters({ category: null, relationManager: null, delayBucket: null });
    try {
      localStorage.removeItem(STORAGE_KEY_DELIVERIES);
      localStorage.removeItem(STORAGE_KEY_FILENAME);
    } catch (e) {
      console.error('Failed to clear localStorage OTIF data', e);
    }
  }, []);

  const isUploadedData = !!activeFileName && deliveries.length > 0;

  return (
    <OtifContext.Provider
      value={{
        deliveries: filteredDeliveries,
        allDeliveries: deliveries,
        summary,
        filters,
        setFilters,
        uploadFile,
        clearOtifData,
        activeFileName,
        isLoading,
        isUploadedData,
        archives,
        loadArchive,
        deleteArchive,
        saveToArchive
      }}
    >
      {children}
    </OtifContext.Provider>
  );
}

export function useOtif() {
  const context = useContext(OtifContext);
  if (!context) {
    throw new Error('useOtif must be used within an OtifProvider');
  }
  return context;
}
