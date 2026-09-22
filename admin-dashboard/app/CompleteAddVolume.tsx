"use client";

import { useEffect, useState } from "react";
import { ImagePlus, LoaderCircle, Plus, X } from "lucide-react";
import { database } from "./lib/supabase";

type Shelf = { shelf_id:number; name:string };
type Props = { data:{shelves:Shelf[]}; close:()=>void; run:(action:()=>PromiseLike<{error:unknown}>,success:string)=>Promise<boolean> };
const initial = {title:"",original_title:"",romanized_title:"",author:"",contributors:"",series_name:"",volume_number:"",isbn:"",publisher:"",imprint:"",format:"Physical",book_type:"Manga",demographic:"",age_rating:"",themes:"",description:"",cover_image_url:"",genres:"",barcode:"",shelf:"",condition_notes:""};
type FormKey = keyof typeof initial;

export function CompleteAddVolume({data,close,run}:Props) {
  const [form,setForm] = useState(initial);
  const [submitting,setSubmitting] = useState(false);
  const [coverFailed,setCoverFailed] = useState(false);
  const [coverFile,setCoverFile] = useState<File|null>(null);
  const [fileError,setFileError] = useState("");
  const [localPreview,setLocalPreview] = useState("");
  useEffect(()=>{
    if(!coverFile){setLocalPreview("");return;}
    const url=URL.createObjectURL(coverFile);setLocalPreview(url);
    return()=>URL.revokeObjectURL(url);
  },[coverFile]);
  const update = (key:FormKey,value:string) => setForm(current=>({...current,[key]:value}));
  const clean = (value:string) => value.trim() || null;
  const input = "mt-2 w-full rounded-xl border border-[#dfcfbe] bg-[#fffbf5] px-3.5 py-3 text-sm font-normal normal-case text-[#4b301f] outline-none transition placeholder:text-[#b5a18e] focus:border-[#b86a18] focus:ring-4 focus:ring-[#d99b2b]/10 disabled:cursor-not-allowed disabled:opacity-50";
  const label = "block text-[10px] font-bold uppercase tracking-[.13em] text-[#795a42]";
  const fields:{key:FormKey;label:string;placeholder:string}[] = [
    {key:"original_title",label:"Original title",placeholder:"Native-language title"},{key:"romanized_title",label:"Romanized title",placeholder:"Romanized title"},{key:"publisher",label:"Publisher",placeholder:"Publisher"},{key:"imprint",label:"Imprint",placeholder:"Imprint"},{key:"isbn",label:"ISBN",placeholder:"ISBN-10 or ISBN-13"},{key:"contributors",label:"Contributors",placeholder:"Illustrator, translator, editor"},{key:"genres",label:"Genres",placeholder:"Adventure, Fantasy, Comedy"},{key:"themes",label:"Themes",placeholder:"Friendship, found family"},{key:"demographic",label:"Demographic",placeholder:"e.g. Shōnen"},{key:"age_rating",label:"Age rating",placeholder:"e.g. Teen / 13+"}
  ];
  const submit = async (event:React.FormEvent) => {
    event.preventDefault(); if(submitting) return; setSubmitting(true);
    const ok = await run(async()=>{
      let coverUrl=clean(form.cover_image_url);
      if(coverFile){
        const extension=(coverFile.name.split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,"");
        const path=`${crypto.randomUUID()}.${extension}`;
        const uploaded=await database().storage.from("book-covers").upload(path,coverFile,{contentType:coverFile.type,cacheControl:"3600",upsert:false});
        if(uploaded.error)return {error:uploaded.error};
        coverUrl=database().storage.from("book-covers").getPublicUrl(uploaded.data.path).data.publicUrl;
      }
      const {data:created,error} = await database().from("books").insert({title:form.title.trim(),original_title:clean(form.original_title),romanized_title:clean(form.romanized_title),author:clean(form.author),contributors:clean(form.contributors),isbn:clean(form.isbn),series_name:clean(form.series_name),volume_number:clean(form.volume_number),format:clean(form.format),publisher:clean(form.publisher),imprint:clean(form.imprint),book_type:clean(form.book_type),demographic:clean(form.demographic),themes:clean(form.themes),age_rating:clean(form.age_rating),description:clean(form.description),cover_image_url:coverUrl,acquisition_status:"IN_LIBRARY"}).select("book_id").single();
      if(error || !created) return {error:error ?? new Error("The volume could not be created.")};
      const genres=[...new Set(form.genres.split(",").map(value=>value.trim()).filter(Boolean))];
      if(genres.length){const result=await database().from("book_genres").insert(genres.map(genre=>({book_id:created.book_id,genre})));if(result.error)return {error:result.error};}
      if(form.barcode.trim()){const result=await database().from("book_copies").insert({book_id:created.book_id,identifier_value:form.barcode.trim(),identifier_type:"BARCODE",shelf_id:form.shelf?Number(form.shelf):null,status:"IN_SHELF",condition_notes:clean(form.condition_notes)});if(result.error)return {error:result.error};}
      return {error:null};
    },"Volume added to the catalogue");
    setSubmitting(false); if(ok) close();
  };
  return <div className="fixed inset-0 z-20 bg-[#2d190c]/40 backdrop-blur-sm" onMouseDown={event=>{if(event.target===event.currentTarget&&!submitting)close();}}><aside role="dialog" aria-modal="true" aria-labelledby="add-volume-title" className="absolute right-0 top-0 flex h-full w-full max-w-[680px] flex-col overflow-hidden border-l border-[#d89b39] bg-[#fffdf9] shadow-[-20px_0_60px_rgba(67,37,18,.2)]">
    <header className="flex items-center justify-between border-b border-[#eadbc9] bg-[linear-gradient(135deg,#fffaf1,#f8ead4)] px-7 py-5"><div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#b66a3c]">Catalogue · New record</p><h2 id="add-volume-title" className="mt-1 font-serif text-3xl text-[#54341f]">Add a volume</h2><p className="mt-1 text-xs text-[#927864]">These details appear in the BONBON reader library.</p></div><button type="button" disabled={submitting} onClick={close} aria-label="Close add volume panel" className="rounded-xl p-2.5 hover:bg-[#efe0cd] disabled:opacity-40"><X size={20}/></button></header>
    <form onSubmit={submit} className="flex-1 overflow-y-auto">
      <section className="grid gap-7 p-7 sm:grid-cols-[150px_1fr]"><div><p className={`${label} mb-2`}>Cover art</p><div className="grid shrink-0 place-items-center overflow-hidden rounded-xl border border-[#dfc69f] bg-[#fffaf1] p-2 shadow-lg" style={{width:150,height:225}}>{(localPreview||(form.cover_image_url&&!coverFailed))?<img src={localPreview||form.cover_image_url} alt="Full cover preview" className="block min-h-0 min-w-0" style={{width:"100%",height:"100%",objectFit:"contain"}} referrerPolicy="no-referrer" onError={()=>setCoverFailed(true)}/>:<div className="text-center text-[#a17954]"><ImagePlus className="mx-auto mb-2" size={30}/><span className="text-[10px] font-bold uppercase tracking-wider">{coverFailed?"Image could not load":"Cover preview"}</span></div>}</div><p className="mt-2 text-[10px] leading-4 text-[#9d8877]">Full image preview · portrait artwork fits best.</p></div><div className="space-y-4"><label className={label}>Title *<input required autoFocus value={form.title} onChange={event=>update("title",event.target.value)} placeholder="e.g. One Piece" className={input}/></label><div className="grid grid-cols-2 gap-3"><label className={label}>Series<input value={form.series_name} onChange={event=>update("series_name",event.target.value)} placeholder="Series name" className={input}/></label><label className={label}>Volume<input value={form.volume_number} onChange={event=>update("volume_number",event.target.value)} placeholder="e.g. 104" className={input}/></label></div><label className={label}>Author<input value={form.author} onChange={event=>update("author",event.target.value)} placeholder="Author or creator" className={input}/></label><label className={label}>Cover image URL<input type="url" value={form.cover_image_url} onChange={event=>{setCoverFailed(false);update("cover_image_url",event.target.value);}} placeholder="https://…/cover.jpg" className={input}/></label><div className="flex items-center gap-3"><span className="h-px flex-1 bg-[#e5d7c8]"/><span className="text-[9px] font-bold uppercase tracking-widest text-[#a58a74]">or upload</span><span className="h-px flex-1 bg-[#e5d7c8]"/></div><label className={`${label} cursor-pointer rounded-xl border border-dashed border-[#d4a45f] bg-[#fff7e9] p-3 text-center transition hover:bg-[#ffefd3]`}><span>{coverFile?coverFile.name:"Choose JPG, PNG or WebP"}</span><input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={event=>{const file=event.target.files?.[0]??null;if(file&&file.size>5*1024*1024){setFileError("Cover image must be 5 MB or smaller.");setCoverFile(null);return;}setFileError("");setCoverFailed(false);setCoverFile(file);}}/></label>{fileError&&<p role="alert" className="text-xs font-semibold text-[#a83d12]">{fileError}</p>}{coverFile&&form.cover_image_url&&<p className="text-[10px] text-[#927864]">The uploaded image will be used instead of the link.</p>}</div></section>
      <section className="border-y border-[#eee2d6] bg-[#fcf7ef] px-7 py-6"><h3 className="mb-4 font-serif text-lg text-[#5b3924]">Reader details</h3><div className="grid gap-4 sm:grid-cols-2">{fields.map(item=><label key={item.key} className={label}>{item.label}<input value={form[item.key]} onChange={event=>update(item.key,event.target.value)} placeholder={item.placeholder} className={input}/>{item.key==="genres"&&<span className="mt-1.5 block text-[10px] normal-case tracking-normal text-[#9d8877]">Separate genres with commas.</span>}</label>)}<label className={label}>Book type<select value={form.book_type} onChange={event=>update("book_type",event.target.value)} className={input}><option>Manga</option><option>Light Novel</option><option>Novel</option><option>Art Book</option><option>Reference</option></select></label><label className={label}>Format<select value={form.format} onChange={event=>update("format",event.target.value)} className={input}><option>Physical</option><option>Hardcover</option><option>Paperback</option><option>Digital</option></select></label></div><label className={`${label} mt-4`}>Synopsis<textarea rows={4} value={form.description} onChange={event=>update("description",event.target.value)} placeholder="Description shown on the book detail screen…" className={`${input} resize-y leading-6`}/></label></section>
      <section className="px-7 py-6"><h3 className="mb-4 font-serif text-lg text-[#5b3924]">Physical copy <span className="font-sans text-[10px] font-bold uppercase tracking-wider text-[#a58a74]">Optional</span></h3><div className="grid gap-4 sm:grid-cols-2"><label className={label}>Barcode<input value={form.barcode} onChange={event=>update("barcode",event.target.value)} placeholder="Scan or enter barcode" className={input}/></label><label className={label}>Shelf<select value={form.shelf} onChange={event=>update("shelf",event.target.value)} disabled={!form.barcode.trim()} className={input}><option value="">No shelf</option>{data.shelves.map(item=><option key={item.shelf_id} value={item.shelf_id}>{item.name}</option>)}</select></label></div><label className={`${label} mt-4`}>Condition notes<input value={form.condition_notes} onChange={event=>update("condition_notes",event.target.value)} disabled={!form.barcode.trim()} placeholder="e.g. New, minor shelf wear" className={input}/></label></section>
      <footer className="sticky bottom-0 flex items-center border-t border-[#e7d7c5] bg-[#fffdf9]/95 px-7 py-5 backdrop-blur"><p className="hidden text-[10px] text-[#98816e] sm:block">* Required · Metadata syncs to BONBON after creation.</p><button type="submit" disabled={submitting||!form.title.trim()} className="ml-auto inline-flex min-w-44 items-center justify-center gap-2 rounded-xl bg-[#a83d12] px-5 py-3 text-xs font-bold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-[#8f320d] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50">{submitting?<><LoaderCircle size={16} className="animate-spin"/>Creating…</>:<><Plus size={16}/>Create volume</>}</button></footer>
    </form>
  </aside></div>;
}
