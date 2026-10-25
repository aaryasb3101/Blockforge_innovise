import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, X, Upload, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

interface QrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (decodedText: string) => void;
}

export const QrScannerModal: React.FC<QrScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
}) => {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = 'qr-reader-container';

  useEffect(() => {
    if (!isOpen) return;

    const startScanner = async () => {
      try {
        setErrorMsg(null);
        const scanner = new Html5Qrcode(containerId);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
          },
          (decodedText) => {
            scanner
              .stop()
              .then(() => {
                onScanSuccess(decodedText);
                onClose();
              })
              .catch(() => {
                onScanSuccess(decodedText);
                onClose();
              });
          },
          () => {
            // Frame scan callback (ignore empty frames)
          }
        );
        setScanning(true);
      } catch (err: any) {
        console.warn('Camera error:', err);
        setErrorMsg(
          'Unable to access camera. You can still scan by uploading an image containing a QR code below.'
        );
      }
    };

    const timer = setTimeout(startScanner, 200);

    return () => {
      clearTimeout(timer);
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, [isOpen]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const html5QrCode = new Html5Qrcode('qr-file-dummy');
      const decoded = await html5QrCode.scanFile(file, true);
      onScanSuccess(decoded);
      onClose();
    } catch {
      toast.error('Could not detect a valid QR code in the uploaded image');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md rounded-2xl border border-surface-border bg-surface-card p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-surface-border pb-3">
          <div className="flex items-center space-x-2">
            <Camera className="h-5 w-5 text-brand-400" />
            <h3 className="text-sm font-bold text-surface-text">
              Scan Credential QR Code
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-surface-muted hover:text-surface-text hover:bg-surface-elevated transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="py-4 space-y-4">
          {errorMsg ? (
            <div className="flex items-start space-x-2 rounded-xl bg-amber-500/10 p-3 border border-amber-500/20 text-xs text-amber-300">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
              <p>{errorMsg}</p>
            </div>
          ) : (
            <div
              id={containerId}
              className="w-full h-64 overflow-hidden rounded-xl border border-surface-border bg-black"
            />
          )}

          {/* Dummy element for file scanning */}
          <div id="qr-file-dummy" className="hidden" />

          {/* Fallback File Upload */}
          <div className="pt-2 border-t border-surface-border">
            <label className="flex items-center justify-center space-x-2 rounded-xl border border-dashed border-surface-border p-3 text-xs font-semibold text-surface-muted hover:text-surface-text hover:border-brand-500/50 cursor-pointer transition-colors">
              <Upload className="h-4 w-4" />
              <span>Upload QR Image instead</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
