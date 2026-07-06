import { useState } from 'react';
import { saveBugReport } from '@/core/storage/bugReports';
import type { FromBackground } from '@/core/messages';

interface Props {
  adapterId: string | null;
  fieldsDetected: number;
  fieldsFilled: number;
  failedFields?: { label: string; mappedKey: string | null; error?: string }[];
  onClose: () => void;
}

export function ReportBug({
  adapterId,
  fieldsDetected,
  fieldsFilled,
  failedFields,
  onClose,
}: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState<string | undefined>();
  const [submitted, setSubmitted] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState('');

  const captureScreenshot = async () => {
    setCapturing(true);
    setCaptureError('');
    try {
      // Use background worker to capture (side panel doesn't have direct tab capture permission)
      const res = (await chrome.runtime.sendMessage({
        type: 'CAPTURE_TAB',
      })) as FromBackground;
      if (res?.type === 'CAPTURE_TAB_RESULT' && res.dataUrl) {
        setScreenshot(res.dataUrl);
      } else {
        setCaptureError('Capture failed. Use "Upload image" instead.');
      }
    } catch {
      setCaptureError('Capture failed. Use "Upload image" instead.');
    }
    setCapturing(false);
  };

  const handleFileUpload = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setScreenshot(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    if (!title.trim()) return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const ua = navigator.userAgent;
    const os = /Mac/.test(ua)
      ? 'macOS'
      : /Win/.test(ua)
        ? 'Windows'
        : /Linux/.test(ua)
          ? 'Linux'
          : 'Other';
    const browser = /Edg/.test(ua)
      ? 'Edge'
      : /Chrome\/(\d+)/.test(ua)
        ? `Chrome ${RegExp.$1}`
        : 'Unknown';
    const manifest = chrome.runtime.getManifest();

    await saveBugReport({
      title: title.trim(),
      description: description.trim(),
      screenshotDataUrl: screenshot,
      url: tab?.url ?? '',
      adapterId,
      fieldsDetected,
      fieldsFilled,
      browser,
      os,
      extensionVersion: manifest.version,
      failedFields,
    });
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="rounded-lg border border-green-700/50 bg-green-900/30 p-3 text-center">
        <p className="text-xs text-green-300 font-medium">Bug report saved!</p>
        <p className="text-[10px] text-slate-400 mt-1">The developer will review it.</p>
        <button onClick={onClose} className="mt-2 text-[10px] text-slate-500 hover:text-slate-300">
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-slate-200">Report a Bug</h3>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xs">
          ✕
        </button>
      </div>

      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What went wrong? (e.g. 'Phone field not filling')"
        className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-200 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
      />

      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Steps to reproduce, which field failed, what you expected..."
        rows={3}
        className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-200 placeholder:text-slate-500 resize-none focus:border-indigo-500 focus:outline-none"
      />

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={captureScreenshot}
          disabled={capturing}
          className="rounded border border-slate-600 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-700 disabled:opacity-50"
        >
          {screenshot ? '✓ Screenshot taken' : capturing ? '📸...' : '📸 Auto-capture'}
        </button>
        <label className="cursor-pointer rounded border border-slate-600 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-700">
          📎 Browse
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFileUpload(e.target.files?.[0])}
          />
        </label>
        {screenshot && (
          <button
            onClick={() => setScreenshot(undefined)}
            className="text-[9px] text-slate-500 hover:text-red-400"
          >
            ✕ Remove
          </button>
        )}
      </div>
      {/* Drag & drop zone */}
      {!screenshot && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            e.currentTarget.classList.add('border-indigo-500');
          }}
          onDragLeave={(e) => {
            e.currentTarget.classList.remove('border-indigo-500');
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.currentTarget.classList.remove('border-indigo-500');
            const file = e.dataTransfer.files[0];
            if (file?.type.startsWith('image/')) handleFileUpload(file);
          }}
          className="rounded-lg border-2 border-dashed border-slate-600 px-3 py-3 text-center text-[10px] text-slate-500 transition hover:border-slate-500"
        >
          Drop screenshot here
        </div>
      )}
      {captureError && !screenshot && <p className="text-[9px] text-red-400">{captureError}</p>}
      {screenshot && (
        <img
          src={screenshot}
          alt="Bug screenshot"
          className="rounded border border-slate-600 max-h-32 w-full object-contain bg-slate-900"
        />
      )}

      {/* Auto-collected info preview */}
      <div className="text-[9px] text-slate-500 space-y-0.5">
        <div>Auto-attached: URL, ATS type, field count, browser, OS, extension version</div>
        {failedFields && failedFields.length > 0 && (
          <div className="text-amber-500">
            {failedFields.length} failed field(s) will be included
          </div>
        )}
      </div>

      <button
        onClick={submit}
        disabled={!title.trim()}
        className="w-full rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-40"
      >
        Submit Report
      </button>
    </div>
  );
}
