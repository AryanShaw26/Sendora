import React, { createContext, useContext, useState } from 'react';

export interface ComposeDraft {
  subject: string;
  body: string;
  emails: string[];
  startTime: string; // datetime-local format
  delaySeconds: number;
  hourlyLimit: number;
  fileName?: string;
  invalidCount?: number;
  duplicateCount?: number;
}

interface ComposeContextType {
  isOpen: boolean;
  isMinimized: boolean;
  isMaximized: boolean;
  draft: ComposeDraft;
  openCompose: () => void;
  closeCompose: (force?: boolean) => void;
  minimizeCompose: () => void;
  maximizeCompose: () => void;
  updateDraft: (partial: Partial<ComposeDraft>) => void;
  resetDraft: () => void;
}

const getDefaultStartTime = () => {
  const d = new Date(Date.now() + 2 * 60 * 1000);
  d.setSeconds(0, 0);
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
};

const initialDraft: ComposeDraft = {
  subject: '',
  body: '',
  emails: [],
  startTime: getDefaultStartTime(),
  delaySeconds: 5,
  hourlyLimit: 100,
};

const ComposeContext = createContext<ComposeContextType | undefined>(undefined);

export const ComposeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [draft, setDraft] = useState<ComposeDraft>(initialDraft);

  const openCompose = () => {
    setIsOpen(true);
    setIsMinimized(false);
  };

  const closeCompose = (force = false) => {
    const isDirty = draft.subject.trim() || draft.body.trim() || draft.emails.length > 0;
    if (!force && isDirty) {
      if (!window.confirm('Discard this draft?')) {
        return;
      }
    }
    setIsOpen(false);
    setIsMinimized(false);
    setIsMaximized(false);
    setDraft({ ...initialDraft, startTime: getDefaultStartTime() });
  };

  const updateDraft = (partial: Partial<ComposeDraft>) => {
    setDraft((prev) => ({ ...prev, ...partial }));
  };

  const resetDraft = () => {
    setDraft({ ...initialDraft, startTime: getDefaultStartTime() });
  };

  return (
    <ComposeContext.Provider
      value={{
        isOpen,
        isMinimized,
        isMaximized,
        draft,
        openCompose,
        closeCompose,
        minimizeCompose: () => setIsMinimized((prev) => !prev),
        maximizeCompose: () => setIsMaximized((prev) => !prev),
        updateDraft,
        resetDraft,
      }}
    >
      {children}
    </ComposeContext.Provider>
  );
};

export const useCompose = (): ComposeContextType => {
  const context = useContext(ComposeContext);
  if (!context) {
    throw new Error('useCompose must be used within a ComposeProvider');
  }
  return context;
};
