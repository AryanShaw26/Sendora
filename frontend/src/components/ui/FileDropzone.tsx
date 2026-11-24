import React, { useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import { parseLeads, LeadParseResult } from '../../utils/csv';

interface FileDropzoneProps {
  onParsed: (result: LeadParseResult, filename: string) => void;
  className?: string;
}

export const FileDropzone: React.FC<FileDropzoneProps> = ({ onParsed, className = '' }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];

    if (!file.name.endsWith('.csv') && !file.name.endsWith('.txt')) {
      setError('Please upload a .csv or .txt file');
      return;
    }

    setError(null);
    setIsParsing(true);
    try {
      const result = await parseLeads(file);
      onParsed(result, file.name);
    } catch (err) {
      setError('Failed to parse lead file. Please check file format.');
    } finally {
      setIsParsing(false);
    }
  };

  return (
    <div className={`w-full ${className}`}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.txt"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            fileInputRef.current?.click();
          }
        }}
        className={`w-full p-4 border-2 border-dashed rounded-xl cursor-pointer transition-colors duration-150 flex flex-col items-center justify-center text-center ${
          isDragging
            ? 'border-red-500 bg-red-50'
            : 'border-red-200 hover:border-red-300 hover:bg-surface-hover bg-white'
        }`}
      >
        <UploadCloud className="w-8 h-8 text-red-500 mb-2" />
        <p className="text-xs font-medium text-ink">
          Drop a <span className="text-red-700 font-semibold">CSV or TXT</span> file of leads, or{' '}
          <span className="text-red-600 underline">browse</span>
        </p>
        <p className="text-[11px] text-ink-soft mt-0.5">
          Automatic email deduplication and format detection
        </p>

        {isParsing && (
          <p className="text-xs text-red-700 font-medium mt-2 animate-pulse">
            Parsing email leads...
          </p>
        )}

        {error && <p className="text-xs text-red-700 font-medium mt-2">{error}</p>}
      </div>
    </div>
  );
};
