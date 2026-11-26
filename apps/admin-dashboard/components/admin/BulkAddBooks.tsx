"use client";

import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BookOpen, Download, LoaderCircle, Pencil, Plus, Printer, ScanLine, Trash2, Upload, X } from "lucide-react";
import { database } from "../../lib/supabase";
import type { Shelf } from "./dashboard-data";
import { printBookLabels, type BookLabel } from "./BookBarcodeLabels";
import { bookImportTemplate, bulkRowError, emptyBulkRow, expandBookQuantities, fillRepeatedBooks, normalizeBookIsbn, parseBookBatch, validBookIsbn, type BulkBookRow } from "./book-batch";

type Mode = "collection" | "new";
type ExistingBook = { book_id:number; isbn:string; title:string; book_genre:string|null; book_type:string; age_rating:number; coverimage_url:string|null; authors:{author_firstname:string;author_lastname:string}|null };
type LookupResponse = { existingBookId?:number|null; error?:string; metadata?:Record<string,string>; coverCandidates?:string[] };
type Props = { data:{shelves:Shelf[]}; close:()=>void; run:(action:()=>PromiseLike<{error:unknown}>,success:string)=>Promise<boolean> };
const field = "w-full rounded-lg border border-[#4b4b4b] bg-[#181818] px-3 py-2 text-sm text-[#f5f5f5] outline-none placeholder:text-[#888] focus:border-[#dd4a13]";
const shelfName = (name:string) => name.match(/Shelf A\d+/i)?.[0] || name;

export function BulkAddBooks({ data, close, run }:Props) {
  const [mode,setMode] = useState<Mode>("new");
  const [rows,setRows] = useState<BulkBookRow[]>([]);
  const [paste,setPaste] = useState("");
  const [scan,setScan] = useState("");
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);
  const [showErrors,setShowErrors] = useState(false);
  const [labels,setLabels] = useState<BookLabel[]>([]);
  const [progress,setProgress] = useState("");
  const [editingIndex,setEditingIndex] = useState<number|null>(null);
  const requestIds = useRef<string[]>([]);
  const shelves = data.shelves.map(item=>shelfName(item.name));
  const copies = rows.reduce((sum,row)=>sum+row.quantity,0);
  const invalidCount = rows.filter(row=>bulkRowError(row)).length;

  const checkCatalog = async(next:BulkBookRow[]) => {
    const isbns=[...new Set(next.map(row=>normalizeBookIsbn(row.isbn)).filter(Boolean))];
    if(!isbns.length){setRows(next);return;}
    const found:ExistingBook[]=[];
    for(let i=0;i<isbns.length;i+=100){
      const result=await database().schema("sora_v2").from("books").select("book_id,isbn,title,book_genre,book_type,age_rating,coverimage_url,authors(author_firstname,author_lastname)").in("isbn",isbns.slice(i,i+100));
      if(result.error)throw result.error;
      found.push(...result.data as unknown as ExistingBook[]);
    }
    const known=new Map(found.map(book=>[normalizeBookIsbn(book.isbn),book]));
    setRows(fillRepeatedBooks(next.map(row=>{
      const book=known.get(normalizeBookIsbn(row.isbn));
      return book?{...row,existingBookId:book.book_id,title:book.title,author:book.authors?`${book.authors.author_firstname} ${book.authors.author_lastname}`:row.author,genre:book.book_genre??row.genre,book_type:book.book_type,age_rating:String(book.age_rating),cover_image_url:book.coverimage_url??row.cover_image_url}:{...row,existingBookId:undefined};
    })));
  };

  const loadText=async(text:string)=>{setError("");setBusy(true);try{await checkCatalog(parseBookBatch(text));}catch(cause){setError(cause instanceof Error?cause.message:"Could not read the import.");}finally{setBusy(false);}};

  const lookup=async()=>{
    const isbn=normalizeBookIsbn(scan);setError("");
    if(!validBookIsbn(isbn)){setError("Scan or enter a valid ISBN-10 or ISBN-13.");return;}
    const index=rows.findIndex(row=>normalizeBookIsbn(row.isbn)===isbn);
    if(index>=0){setRows(current=>current.map((row,i)=>i===index?{...row,quantity:Math.min(100,row.quantity+1)}:row));setScan("");return;}
    setBusy(true);
    try{
      const {data:{session}}=await database().auth.getSession();
      if(!session)throw new Error("Your staff session has expired. Sign in again.");
      const response=await fetch("/api/catalog/lookup",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({isbn,useAi:true})});
      const result=await response.json() as LookupResponse;
      if(!response.ok)throw new Error(result.error||"No metadata was found.");
      const meta=result.metadata||{};
      const next:BulkBookRow={...emptyBulkRow(),isbn,title:meta.title||"",author:meta.author||"",genre:meta.genres||meta.genre||"",tags:meta.themes||"",book_type:meta.book_type||"Manga",age_rating:meta.age_rating||"",shelf_location:shelves[0]||"",cover_image_url:result.coverCandidates?.[0]||meta.cover_image_url,existingBookId:result.existingBookId??undefined};
      setRows(current=>fillRepeatedBooks([...current,next]));setScan("");
    }catch(cause){setRows(current=>[...current,{...emptyBulkRow(),isbn,shelf_location:shelves[0]||""}]);setScan("");setError(`${cause instanceof Error?cause.message:"Lookup failed"} The ISBN was added for review.`);}finally{setBusy(false);}
  };

  const edit=(index:number,key:keyof BulkBookRow,value:string|number)=>setRows(current=>current.map((row,i)=>i===index?{...row,[key]:value,...(key==="isbn"?{existingBookId:undefined}:{})}:row));
  const splitCopy=(index:number)=>setRows(current=>{const source=current[index];if(!source)return current;const copy={...source,quantity:1,shelf_location:""};return source.quantity===1?[...current.slice(0,index+1),copy,...current.slice(index+1)]:current.flatMap((row,i)=>i===index?[{...row,quantity:row.quantity-1},copy]:[row]);});

  const submit=async()=>{
    setError("");setShowErrors(true);
    if(!rows.length||copies>5000){setError("Register between 1 and 5,000 physical copies per session.");return;}
    const invalid=rows.findIndex(row=>bulkRowError(row));if(invalid>=0){setError(`Item ${invalid+1}: ${bulkRowError(rows[invalid])}`);return;}
    const entries=expandBookQuantities(rows);const chunks=Array.from({length:Math.ceil(entries.length/100)},(_,i)=>entries.slice(i*100,i*100+100));
    while(requestIds.current.length<chunks.length)requestIds.current.push(crypto.randomUUID());
    setBusy(true);
    try{
      const saved:BookLabel[]=[];
      const ok=await run(async()=>{
        for(let i=0;i<chunks.length;i++){
          setProgress(`Registering batch ${i+1} of ${chunks.length}...`);
          const result=await database().schema("sora_v2").rpc("admin_register_books_idempotent",{p_request_id:requestIds.current[i],p_entries:chunks[i].map(row=>({isbn:normalizeBookIsbn(row.isbn),title:row.title,author:row.author,genre:row.genre,book_type:row.book_type,age_rating:row.age_rating,shelf_location:row.shelf_location,condition_notes:row.condition_notes||null,acquisition_date:row.acquisition_date||null,cover_image_url:row.cover_image_url||null,metadata:{themes:row.tags.trim()||null}}))});
          if(result.error){setError(result.error.message);return result;}saved.push(...result.data as BookLabel[]);
        }
        return {error:null};
      },`${entries.length} physical ${entries.length===1?"copy":"copies"} registered`);
      if(ok)setLabels(saved);
    }catch(cause){setError(cause instanceof Error?cause.message:"Could not register the books.");}finally{setBusy(false);setProgress("");}
  };

  const downloadTemplate=()=>{const url=URL.createObjectURL(new Blob([bookImportTemplate],{type:"text/csv;charset=utf-8"}));const link=document.createElement("a");link.href=url;link.download="tankobonbon-book-import-template.csv";link.click();URL.revokeObjectURL(url);};

  return createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-2 backdrop-blur-sm"><section role="dialog" aria-modal="true" aria-labelledby="bulk-add-title" className="max-h-[96dvh] w-full max-w-[620px] overflow-y-auto rounded-xl border border-[#555] bg-[#202020] p-3 text-[#eee] shadow-2xl sm:p-4">
    <header className="flex items-start justify-between gap-4"><div><p className="text-[10px] uppercase tracking-wide text-[#d7d7d7]">Catalogue · Bulk registration</p><h2 id="bulk-add-title" className="mt-1 text-base font-bold leading-none">Bulk Add Books</h2><p className="mt-1 text-xs text-[#d4d4d4]">Register multiple volumes in one session.</p></div><button aria-label="Close bulk registration" onClick={close} disabled={busy} className="rounded p-1 text-[#ddd] hover:bg-white/10"><X size={16}/></button></header>
    {labels.length?<Success labels={labels} close={close}/>:<>
      <div className="mt-3 grid grid-cols-2 gap-2"><ModeButton active={mode==="collection"} onClick={()=>setMode("collection")}><Upload size={14}/>Import Existing Collection</ModeButton><ModeButton active={mode==="new"} onClick={()=>setMode("new")}><ScanLine size={14}/>Register New Books</ModeButton></div>
      {mode==="collection"?<div className="mt-3 grid gap-3 rounded-lg border border-[#3f3f3f] p-3 sm:grid-cols-2"><label className="text-xs"><b>Upload CSV or TSV</b><span className="mt-1 block text-[11px] text-[#aaa]">Up to 5,000 rows. Quantity can represent copies.</span><input type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" disabled={busy} className="mt-3 block w-full text-[11px]" onChange={async event=>{const file=event.target.files?.[0];if(file)await loadText(await file.text());}}/><button type="button" onClick={downloadTemplate} className="mt-3 flex items-center gap-1 text-[11px] font-bold text-[#ef5b22]"><Download size={13}/>Download template</button></label><div><label className="text-xs font-bold">Paste spreadsheet data<textarea rows={4} value={paste} onChange={event=>setPaste(event.target.value)} className={`${field} mt-1 font-mono text-[11px]`} placeholder="isbn,title,author,genre,quantity,shelf"/></label><button disabled={busy||!paste.trim()} onClick={()=>void loadText(paste)} className="mt-2 rounded-lg border border-[#555] px-3 py-2 text-xs font-bold disabled:opacity-50">Load pasted rows</button></div></div>:<div className="mt-3"><div className="flex gap-2"><div className="relative flex-1"><ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 text-[#bbb]" size={15}/><input autoFocus aria-label="Scan or enter ISBN" value={scan} onChange={event=>setScan(event.target.value)} onKeyDown={event=>{if(event.key==="Enter")void lookup();}} className={`${field} pl-9`} placeholder="Scan or enter ISBN"/></div><button disabled={busy||!scan.trim()} onClick={()=>void lookup()} className="shrink-0 rounded-lg bg-[#c74011] px-4 text-sm font-bold text-white disabled:opacity-50"><Plus className="mr-1 inline" size={15}/>Add to queue</button></div><p className="mt-2 text-[11px] text-[#ccc]">Continuous scanning enabled · Registration queue</p></div>}
      <div className="mt-3 grid grid-cols-3 border-b border-[#454545] pb-3 text-xs"><Stat value={copies} label="Total copies"/><Stat value={rows.length-invalidCount} label="Ready" tone="text-[#00df61]"/><Stat value={invalidCount} label="Needs review" tone="text-[#ff5a00]"/></div>
      <div>{rows.length===0?<div className="border-b border-[#3b3b3b] py-10 text-center text-xs text-[#aaa]">{mode==="collection"?"Upload or paste a spreadsheet to preview the collection.":"Scan the first ISBN to start the registration queue."}</div>:rows.map((row,index)=><QueueCard key={`${row.isbn}-${index}`} row={row} index={index} shelves={shelves} showError={showErrors} expanded={editingIndex===index} toggle={()=>setEditingIndex(current=>current===index?null:index)} edit={edit} remove={()=>{setRows(current=>current.filter((_,i)=>i!==index));setEditingIndex(null);}} split={()=>splitCopy(index)}/>)}</div>
      <footer className="sticky bottom-0 mt-3 flex items-center justify-between gap-3 bg-[#202020] pt-3"><p className="text-[11px] text-[#ddd]">{invalidCount?`${invalidCount} ${invalidCount===1?"item requires":"items require"} review before registration.`:"Ready to register. Each copy gets a unique barcode."}</p><button disabled={busy||!rows.length} onClick={()=>void submit()} className="shrink-0 rounded-lg bg-[#c74011] px-4 py-3 text-xs font-bold text-white disabled:opacity-50">{busy?<><LoaderCircle className="mr-2 inline animate-spin" size={15}/>{progress||"Checking..."}</>:"Review & register"}</button></footer>
    </>}{error&&<p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
  </section></div>, document.body);
}

function ModeButton({active,onClick,children}:{active:boolean;onClick:()=>void;children:ReactNode}){return <button onClick={onClick} className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs ${active?"border-[#e04813] bg-[#29201d] font-bold text-white":"border-[#4b4b4b] text-[#ddd]"}`}>{children}</button>}
function Stat({value,label,tone=""}:{value:number;label:string;tone?:string}){return <div><span className="block text-[11px] text-[#ddd]">{label}</span><b className={`mt-1 block text-base font-medium ${tone}`}>{value}</b></div>}
function Success({labels,close}:{labels:BookLabel[];close:()=>void}){return <div className="mt-4 space-y-3"><div className="rounded-lg border border-[#3d634b] bg-[#17271d] p-3"><h3 className="font-bold">Registration complete</h3><p className="mt-1 text-xs text-[#ccc]">Saved {labels.length} physical copies. Each copy has its own unique barcode.</p></div><div className="max-h-64 overflow-y-auto rounded-lg border border-[#444] p-3 text-xs">{labels.map(label=><p key={label.copy_id} className="border-b border-[#3b3b3b] py-2 last:border-0"><b>{label.title}</b> · Copy {label.copy_number} · {label.barcode}</p>)}</div><div className="flex gap-2"><button onClick={()=>printBookLabels(labels)} className="flex items-center gap-2 rounded-lg bg-[#c74011] px-4 py-3 text-xs font-bold text-white"><Printer size={15}/>Print all copy barcodes</button><button onClick={close} className="rounded-lg border border-[#555] px-4 py-3 text-xs font-bold">Done</button></div></div>}

function QueueCard({row,index,shelves,showError,expanded,toggle,edit,remove,split}:{row:BulkBookRow;index:number;shelves:string[];showError:boolean;expanded:boolean;toggle:()=>void;edit:(index:number,key:keyof BulkBookRow,value:string|number)=>void;remove:()=>void;split:()=>void}){
  const issue=bulkRowError(row);
  return <article className={`border-b border-[#3b3b3b] py-3 ${showError&&issue?"bg-[#321b17]":""}`}>
    <div className="flex items-center gap-3">
      <div className="flex h-12 w-9 shrink-0 items-center justify-center overflow-hidden rounded bg-[#0e0e0e]">{row.cover_image_url?<img src={row.cover_image_url} alt="" className="h-full w-full object-cover"/>:<BookOpen size={14} className="text-[#ddd]"/>}</div>
      <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{row.title||"Unknown ISBN"}</p><p className="mt-1 truncate text-[10px] text-[#ddd]">{row.author||"Metadata unavailable"}</p><p className={`mt-1 text-[10px] ${issue?"text-[#ff5a00]":"text-[#00df61]"}`}>{issue?"Needs review":"✓ Ready to register"}</p></div>
      <div className="grid grid-cols-2 gap-4 text-center text-[10px]"><div><span className="block text-[#ddd]">Copies</span><b className="mt-1 block text-xs">{row.quantity}</b></div><div><span className="block text-[#ddd]">Shelf</span><b className="mt-1 block text-xs font-normal">{row.shelf_location||"Unassigned"}</b></div></div>
      <button aria-label={`Edit ${row.title||"item"}`} onClick={toggle} className="rounded p-2 text-[#ddd] hover:bg-white/10"><Pencil size={13}/></button>
    </div>
    {expanded&&<div className="mt-3 rounded-lg border border-[#444] bg-[#181818] p-3"><div className="grid gap-2 sm:grid-cols-2"><Input label="ISBN" value={row.isbn} onChange={value=>edit(index,"isbn",value)}/><Input label="Title" value={row.title} disabled={!!row.existingBookId} onChange={value=>edit(index,"title",value)}/><Input label="Author" value={row.author} disabled={!!row.existingBookId} onChange={value=>edit(index,"author",value)}/><Input label="Genre" value={row.genre} disabled={!!row.existingBookId} onChange={value=>edit(index,"genre",value)}/><Input label="Age rating" value={row.age_rating} disabled={!!row.existingBookId} type="number" onChange={value=>edit(index,"age_rating",value)}/><Input label="Copies" value={String(row.quantity)} type="number" onChange={value=>edit(index,"quantity",Number(value))}/><label className="text-[10px] font-bold">Shelf<select value={row.shelf_location} onChange={event=>edit(index,"shelf_location",event.target.value)} className={`${field} mt-1`}><option value="">Select shelf</option>{shelves.map(value=><option key={value}>{value}</option>)}</select></label><Input label="Condition" value={row.condition_notes||""} placeholder="e.g. New" onChange={value=>edit(index,"condition_notes",value)}/></div><div className="mt-3 flex flex-wrap justify-between gap-2"><button onClick={split} className="text-[10px] font-bold text-[#ff6a31]">Assign one copy to another shelf</button><button onClick={remove} className="flex items-center gap-1 text-[10px] font-bold text-red-400"><Trash2 size={12}/>Remove item</button></div></div>}
  </article>;
}
function Input({label,value,onChange,disabled=false,type="text",placeholder=""}:{label:string;value:string;onChange:(value:string)=>void;disabled?:boolean;type?:string;placeholder?:string}){return <label className="text-[10px] font-bold">{label}<input type={type} value={value} disabled={disabled} placeholder={placeholder} onChange={event=>onChange(event.target.value)} className={`${field} mt-1 disabled:bg-[#292929] disabled:text-[#aaa]`}/></label>}
