"use client";
import { useEffect, useState } from "react";
<<<<<<< Updated upstream
import { ImagePlus, LoaderCircle, Save, X } from "lucide-react";
import { database, usesReplacementSchema } from "../../lib/supabase";
import type { Book } from "./dashboard-data";

export function EditBookCover({
  book,
  close,
  run,
}: {
  book: Book;
  close: () => void;
  run: (
    action: () => PromiseLike<{ error: unknown }>,
    success: string,
  ) => Promise<boolean>;
}) {
  const [url, setUrl] = useState(book.cover_image_url ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [imageFailed, setImageFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const ok = await run(async () => {
      let coverUrl = url.trim() || null;
      if (file) {
        const extension = (file.name.split(".").pop() || "jpg")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "");
        const upload = await database()
          .storage.from("book-covers")
          .upload(`${crypto.randomUUID()}.${extension}`, file, {
            contentType: file.type,
            cacheControl: "3600",
          });
        if (upload.error) return { error: upload.error };
        coverUrl = database()
          .storage.from("book-covers")
          .getPublicUrl(upload.data.path).data.publicUrl;
      }
      const client = usesReplacementSchema
        ? database().schema("sora_v2")
        : database();
      return client.rpc("admin_update_book_cover", {
        p_book_id: book.book_id,
        p_cover_image_url: coverUrl,
      });
    }, "Saved! Cover art updated in the database.");
    setBusy(false);
    if (ok) close();
  };
  return (
    <div className="fixed inset-0 z-[60] bg-[#2d190c]/40 backdrop-blur-sm">
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-cover-title"
        className="absolute right-0 top-0 flex h-full w-full max-w-[500px] flex-col bg-[#fffdf9] shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-[#eadbc9] bg-[#fff7e9] px-7 py-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#b66a3c]">
              Catalogue · Edit record
            </p>
            <h2
              id="edit-cover-title"
              className="mt-1 font-serif text-2xl text-[#54341f]"
            >
              Update cover art
            </h2>
            <p className="mt-1 text-xs text-[#927864]">{book.title}</p>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="rounded-xl p-2 hover:bg-[#efe0cd]"
          >
            <X size={20} />
          </button>
        </header>
        <form
          onSubmit={save}
          className="flex flex-1 flex-col overflow-y-auto p-7"
        >
          <div
            className="mx-auto grid shrink-0 place-items-center overflow-hidden rounded-xl border border-[#dfc69f] bg-[#fffaf1] p-2 shadow-[0_12px_28px_rgba(79,46,24,.16)]"
            style={{ width: 190, height: 285 }}
          >
            {(preview || url) && !imageFailed ? (
              <img
                src={preview || url}
                alt="Full book cover preview"
                className="block min-h-0 min-w-0"
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
                referrerPolicy="no-referrer"
                onLoad={() => setImageFailed(false)}
                onError={() => setImageFailed(true)}
              />
            ) : (
              <div className="px-4 text-center text-[#a17954]">
                <ImagePlus size={32} className="mx-auto" />
                <p className="mt-3 text-[10px] font-bold uppercase tracking-wider">
                  {imageFailed ? "Image link could not load" : "Cover preview"}
                </p>
              </div>
            )}
          </div>
          <p className="mt-3 text-center text-[10px] text-[#9d8877]">
            The full image is shown without cropping. Portrait artwork fits
            best.
          </p>
          <label className="mt-7 block text-[10px] font-bold uppercase tracking-[.13em] text-[#795a42]">
            Cover image URL
            <input
              type="url"
              value={url}
              onFocus={() => {
                if (file) {
                  setFile(null);
                  setError("");
                }
              }}
              onChange={(event) => {
                setUrl(event.target.value);
                setFile(null);
                setImageFailed(false);
              }}
              placeholder="https://…/cover.jpg"
              className={`mt-2 w-full rounded-xl border bg-[#fffbf5] px-3.5 py-3 text-sm outline-none focus:border-[#b86a18] ${!file && url.trim() ? "border-emerald-500 ring-4 ring-emerald-500/10" : "border-[#dfcfbe]"}`}
            />
          </label>
          {!file && url.trim() && (
            <p className="mt-2 text-[10px] font-bold text-emerald-700">
              ✓ Link mode selected — this URL will be saved directly.
            </p>
          )}
          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-[#e5d7c8]" />
            <span className="text-[9px] font-bold uppercase tracking-widest text-[#a58a74]">
              or upload
            </span>
            <span className="h-px flex-1 bg-[#e5d7c8]" />
          </div>
          <label
            className={`cursor-pointer rounded-xl border border-dashed p-4 text-center text-xs font-bold transition ${file ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-[#d4a45f] bg-[#fff7e9] text-[#795a42] hover:bg-[#ffefd3]"}`}
          >
            {file
              ? `${file.name} · upload mode selected`
              : "Choose JPG, PNG, or WebP (max 5 MB)"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(event) => {
                const selected = event.target.files?.[0] ?? null;
                if (selected && selected.size > 5 * 1024 * 1024) {
                  setError("Cover image must be 5 MB or smaller.");
                  setFile(null);
                  return;
                }
                setError("");
                setImageFailed(false);
                setFile(selected);
              }}
            />
          </label>
          {file && (
            <button
              type="button"
              onClick={() => {
                setFile(null);
                setError("");
              }}
              className="mt-2 w-full text-center text-[10px] font-bold uppercase tracking-wider text-[#a83d12] hover:underline"
            >
              Use image link instead
            </button>
          )}
          {error && (
            <p
              role="alert"
              className="mt-3 text-xs font-semibold text-[#a83d12]"
            >
              {error}
            </p>
          )}
          <p className="mt-3 text-[10px] leading-4 text-[#9d8877]">
            Only the selected source is saved. Link mode writes the URL
            directly; upload mode requires the <code>book-covers</code> Storage
            bucket.
          </p>
          <footer className="mt-auto border-t border-[#e7d7c5] pt-6">
            <button
              disabled={busy || (!url.trim() && !file)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#a83d12] px-5 py-3 text-xs font-bold text-white disabled:opacity-50"
            >
              {busy ? (
                <>
                  <LoaderCircle size={16} className="animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Save size={16} />
                  Save cover
                </>
              )}
            </button>
          </footer>
        </form>
      </aside>
    </div>
  );
=======
import { ImagePlus, LoaderCircle, Save, Trash2, X } from "lucide-react";
import { database } from "../../lib/supabase";
type Book = {book_id:number;title:string;original_title:string|null;romanized_title:string|null;author:string|null;contributors:string|null;isbn:string|null;series_name:string|null;volume_number:string|null;format:string|null;publisher:string|null;imprint:string|null;book_type:string|null;demographic:string|null;age_rating:string|null;themes:string|null;description:string|null;cover_image_url:string|null;acquisition_status:string;book_genres:{genre:string}[];book_copies:{copy_id:number;status:string;identifier_value:string}[]};
type Props = {book:Book;close:()=>void;run:(action:()=>PromiseLike<{error:unknown}>,success:string)=>Promise<boolean>};
const keys = ["title","original_title","romanized_title","author","contributors","isbn","series_name","volume_number","publisher","imprint","demographic","age_rating","themes","description"] as const;
const labels:Record<string,string> = {title:"Title",original_title:"Original title",romanized_title:"Romanized title",author:"Author",contributors:"Contributors",isbn:"ISBN",series_name:"Series",volume_number:"Volume number",publisher:"Publisher",imprint:"Imprint",demographic:"Demographic",age_rating:"Age rating",themes:"Themes",description:"Synopsis"};
export function EditBookCover({book,close,run}:Props) {
 const [form,setForm]=useState(()=>Object.fromEntries(keys.map(key=>[key,book[key]??""])) as Record<(typeof keys)[number],string>); const [genres,setGenres]=useState(book.book_genres.map(item=>item.genre).join(", ")); const [status,setStatus]=useState(book.acquisition_status); const [url,setUrl]=useState(book.cover_image_url??""); const [file,setFile]=useState<File|null>(null); const [preview,setPreview]=useState(""); const [busy,setBusy]=useState(false); const [error,setError]=useState(""); const [imageFailed,setImageFailed]=useState(false);
 useEffect(()=>{if(!file){setPreview("");return;}const objectUrl=URL.createObjectURL(file);setPreview(objectUrl);return()=>URL.revokeObjectURL(objectUrl);},[file]);
 const input="mt-2 w-full rounded-xl border border-[#dfcfbe] bg-[#fffbf5] px-3.5 py-3 text-sm text-[#4b301f] outline-none focus:border-[#b86a18] focus:ring-4 focus:ring-[#d99b2b]/10";
 const save=async(event:React.FormEvent)=>{event.preventDefault();if(busy)return;setBusy(true);const ok=await run(async()=>{let coverUrl=url.trim()||null;if(file){const ext=(file.name.split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,"");const upload=await database().storage.from("book-covers").upload(`${crypto.randomUUID()}.${ext}`,file,{contentType:file.type,cacheControl:"3600"});if(upload.error)return {error:upload.error};coverUrl=database().storage.from("book-covers").getPublicUrl(upload.data.path).data.publicUrl;}const result=await database().rpc("admin_update_catalog_entry",{p_book_id:book.book_id,p_book:{...form,cover_image_url:coverUrl,acquisition_status:status},p_genres:genres.split(",").map(value=>value.trim()).filter(Boolean)});return result;} ,"Saved! Book record updated.");setBusy(false);if(ok)close();};
 const remove=async()=>{if(book.book_copies.length){setError("This title still has physical copies. Retire or remove those copies before deleting the title.");return;}if(!window.confirm(`Delete “${book.title}”? This cannot be undone.`))return;setBusy(true);const ok=await run(()=>database().rpc("admin_delete_catalog_entry",{p_book_id:book.book_id}),"Book deleted");setBusy(false);if(ok)close();};
 return <div className="fixed inset-0 z-[60] bg-[#2d190c]/40 backdrop-blur-sm"><aside role="dialog" aria-modal="true" className="absolute right-0 top-0 flex h-full w-full max-w-[680px] flex-col bg-[#fffdf9] shadow-2xl"><header className="flex items-center justify-between border-b border-[#eadbc9] bg-[#fff7e9] px-7 py-5"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#b66a3c]">Catalogue · Edit record</p><h2 className="mt-1 font-serif text-2xl text-[#54341f]">Edit everything</h2><p className="mt-1 text-xs text-[#927864]">Update metadata, cover art, genres, and status.</p></div><button type="button" onClick={close} disabled={busy} className="rounded-xl p-2 hover:bg-[#efe0cd]"><X size={20}/></button></header><form onSubmit={save} className="flex-1 overflow-y-auto p-7"><div className="mb-7 grid gap-6 sm:grid-cols-[150px_1fr]"><div><div className="grid place-items-center overflow-hidden rounded-xl border border-[#dfc69f] bg-[#fffaf1] p-2" style={{width:150,height:225}}>{(preview||url)&&!imageFailed?<img src={preview||url} alt="Book cover preview" className="h-full w-full object-contain" onError={()=>setImageFailed(true)}/>:<ImagePlus className="text-[#a17954]" size={34}/>}</div><label className="mt-3 block cursor-pointer rounded-xl border border-dashed border-[#d4a45f] bg-[#fff7e9] p-3 text-center text-[10px] font-bold text-[#795a42]">{file?file.name:"Upload cover"}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={event=>{const selected=event.target.files?.[0]??null;if(selected&&selected.size>5*1024*1024){setError("Cover image must be 5 MB or smaller.");return;}setFile(selected);setImageFailed(false);}}/></label></div><div><label className="block text-[10px] font-bold uppercase tracking-[.13em] text-[#795a42]">Cover image URL<input type="url" value={url} onChange={event=>{setUrl(event.target.value);setFile(null);setImageFailed(false);}} className={input} placeholder="https://.../cover.jpg"/></label><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-[10px] font-bold uppercase tracking-[.13em] text-[#795a42]">Genres<input value={genres} onChange={event=>setGenres(event.target.value)} className={input} placeholder="Action, Fantasy"/></label><label className="text-[10px] font-bold uppercase tracking-[.13em] text-[#795a42]">Status<select value={status} onChange={event=>setStatus(event.target.value)} className={input}><option>IN_LIBRARY</option><option>RESTRICTED</option><option>WAITLISTED</option><option>INCOMING</option><option>ELECTION_WINNER</option><option>NOT_IN_DATABASE</option></select></label></div></div></div><div className="grid gap-4 sm:grid-cols-2">{keys.map(key=><label key={key} className={`text-[10px] font-bold uppercase tracking-[.13em] text-[#795a42] ${key==="description"?"sm:col-span-2":""}`}>{labels[key]}{key==="description"?<textarea rows={4} value={form[key]} onChange={event=>setForm(current=>({...current,[key]:event.target.value}))} className={input}/>:<input value={form[key]} onChange={event=>setForm(current=>({...current,[key]:event.target.value}))} className={input}/>}</label>)}</div>{error&&<p role="alert" className="mt-5 rounded-xl bg-[#fff0e8] p-3 text-xs font-semibold text-[#a83d12]">{error}</p>}<footer className="mt-7 flex flex-col-reverse gap-3 border-t border-[#e7d7c5] pt-6 sm:flex-row sm:justify-between"><button type="button" onClick={()=>void remove()} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 px-4 py-3 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><Trash2 size={16}/>Delete title</button><button disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#a83d12] px-5 py-3 text-xs font-bold text-white disabled:opacity-50">{busy?<LoaderCircle size={16} className="animate-spin"/>:<Save size={16}/>}Save changes</button></footer></form></aside></div>;
>>>>>>> Stashed changes
}
