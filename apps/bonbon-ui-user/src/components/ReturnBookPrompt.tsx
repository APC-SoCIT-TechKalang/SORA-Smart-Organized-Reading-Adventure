import { useEffect, useRef, useState } from 'react';
import type { IScannerControls } from '@zxing/browser';
import { CameraIcon, ScanLineIcon, XIcon } from 'lucide-react';
import { createPortal } from 'react-dom';

export function ReturnBookPrompt({ title, busy, close, confirm }: {
  title: string; busy: boolean; close: () => void;
  confirm: (barcode: string) => Promise<boolean>;
}) {
  const [barcode, setBarcode] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [returnError, setReturnError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    if (!cameraOpen) return;
    let controls: IScannerControls | null = null;
    let stopped = false;
    const open = async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (!video.current) return;
        controls = await new BrowserMultiFormatReader().decodeFromVideoDevice(undefined, video.current, result => {
          if (result && !stopped) {
            setBarcode(result.getText());
            setCameraOpen(false);
          }
        });
        if (stopped) controls.stop();
      } catch (cause) {
        setCameraError(cause instanceof Error ? cause.message : 'Camera scanning is unavailable.');
        setCameraOpen(false);
      }
    };
    void open();
    return () => { stopped = true; controls?.stop(); if (video.current) video.current.srcObject = null; };
  }, [cameraOpen]);

  return createPortal(<div className="fixed inset-0 z-[100] grid place-items-center overflow-hidden bg-umber/55 p-2 backdrop-blur-sm sm:p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="return-book-title" className="tb-surface tb-cut-lg max-h-[calc(100dvh-1rem)] w-full max-w-lg overflow-y-auto border border-gold/40 bg-cream p-4 shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:p-8">
      <div className="flex items-start justify-between gap-4"><div><p className="tb-eyebrow">Return one book</p><h2 id="return-book-title" className="mt-1 font-display text-2xl font-900 text-umber">Finish reading</h2></div><button type="button" onClick={close} disabled={busy} aria-label="Close return prompt"><XIcon className="h-5 w-5" /></button></div>
      <p className="mt-4 font-800">{title}</p>
      <p className="mt-2 text-sm leading-6 text-umber/65">Scan this book’s ISBN barcode or its library copy barcode, then place the selected copy in the return cart. Your seat and session timer will continue.</p>
      {cameraOpen && <video ref={video} muted playsInline aria-label="Book barcode camera preview" className="mt-4 aspect-video w-full rounded-lg bg-umber object-cover" />}
      {cameraError && <p role="alert" className="mt-3 text-sm text-rust">{cameraError}</p>}
      <form onSubmit={event => { event.preventDefault(); setReturnError(''); void confirm(barcode).then(ok => { if (!ok) setReturnError('That copy could not be returned. Check its ISBN or copy barcode and try again.'); }); }} className="mt-5">
        <label className="block text-sm font-800">ISBN or copy barcode<input ref={input} className="tb-input mt-2 w-full rounded-lg px-3 py-3" autoComplete="off" value={barcode} onChange={event => setBarcode(event.target.value)} required maxLength={100} placeholder="Scan here, then press Enter" /></label>
        <div className="mt-4 flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={() => { setCameraError(''); setCameraOpen(value => !value); }} className="tb-button-secondary tb-cut-sm px-4 py-3 text-sm"><CameraIcon className="h-4 w-4" /> {cameraOpen ? 'Stop camera' : 'Use camera'}</button><button type="submit" disabled={busy || !barcode.trim()} className="tb-button-primary tb-cut-sm px-4 py-3 text-sm"><ScanLineIcon className="h-4 w-4" /> {busy ? 'Checking…' : 'Confirm return'}</button></div>
        {returnError && <p role="alert" className="mt-3 text-sm text-rust">{returnError}</p>}
      </form>
    </section>
  </div>, document.body);
}
