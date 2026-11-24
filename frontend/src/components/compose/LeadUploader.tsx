import React from 'react';
import { Mail } from 'lucide-react';
import { FileDropzone } from '../ui/FileDropzone';
import { Chip } from '../ui/Chip';
import { useCompose } from './ComposeProvider';

export const LeadUploader: React.FC = () => {
  const { draft, updateDraft } = useCompose();

  const handleParsed = (
    result: { valid: string[]; invalidCount: number; duplicateCount: number },
    filename: string
  ) => {
    updateDraft({
      emails: result.valid,
      fileName: filename,
      invalidCount: result.invalidCount,
      duplicateCount: result.duplicateCount,
    });
  };

  const handleClear = () => {
    updateDraft({
      emails: [],
      fileName: undefined,
      invalidCount: 0,
      duplicateCount: 0,
    });
  };

  if (draft.emails.length > 0) {
    return (
      <div className="flex flex-wrap items-center gap-2 py-1">
        <Chip
          variant="red"
          icon={<Mail className="w-3.5 h-3.5 text-red-700" />}
          onRemove={handleClear}
          className="text-xs font-semibold"
        >
          {draft.emails.length} valid email addresses detected
        </Chip>

        {((draft.invalidCount ?? 0) > 0 || (draft.duplicateCount ?? 0) > 0) && (
          <span className="text-xs text-ink-soft">
            ({(draft.invalidCount ?? 0) + (draft.duplicateCount ?? 0)} invalid or duplicate skipped)
          </span>
        )}

        <button
          type="button"
          onClick={handleClear}
          className="text-xs text-red-700 hover:text-red-800 underline ml-auto"
        >
          Replace file
        </button>
      </div>
    );
  }

  return <FileDropzone onParsed={handleParsed} />;
};
