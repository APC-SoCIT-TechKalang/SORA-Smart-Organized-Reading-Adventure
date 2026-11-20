import { database, readReplacementRows } from "../../lib/supabase";

export type Book = { book_id: number; title: string; author: string | null; cover_image_url: string | null; acquisition_status: string; book_genres: { genre: string }[]; book_copies: { copy_id: number; status: string; identifier_value: string }[] };
export type Copy = { copy_id: number; book_id: number; identifier_value: string; status: string; condition_notes: string | null; shelf_location: string | null; shelf_id: number | null };
export type Reader = { user_id: string; first_name: string; last_name: string; birthday: string | null; is_active: boolean; roles: { name: string } | null };
export type MemberAccount = { user_id: string; membership_label: string; remaining_minutes: number | null; status: string; expires_at: string | null };
export type Visit = { visit_id: number; user_id: string | null; checked_in_at: string; scheduled_end_at: string | null; status: string };
export type ReadingLog = { reading_log_id: number; book_id: number; started_at: string; returned_at: string | null; total_reading_minutes: number | null };
export type Quest = { quest_id: number; name: string; description: string; quest_type: string; points_reward: number; status: string };
export type Enrollment = { quest_progress_id: number; quest_id: number; user_id: string; status: string };
export type Plan = { membership_type_id: number; name: string; entry_type: string };
export type Shelf = { shelf_id: number; name: string };

export type DashboardData = {
  books: Book[];
  copies: Copy[];
  readers: Reader[];
  memberAccounts: MemberAccount[];
  visits: Visit[];
  logs: ReadingLog[];
  quests: Quest[];
  enrollments: Enrollment[];
  plans: Plan[];
  shelves: Shelf[];
};

export const emptyDashboardData: DashboardData = {
  books: [], copies: [], readers: [], memberAccounts: [], visits: [],
  logs: [], quests: [], enrollments: [], plans: [], shelves: [],
};

export async function loadDashboardData(): Promise<DashboardData> {
  return loadFixedDashboardData();
}

type ReplacementBook = { book_id:number; title:string; coverimage_url:string|null; authors:{author_firstname:string;author_lastname:string}|null; book_genre:string|null; book_copies:{copy_id:number;copy_status:string;barcode:string}[] };
type ReplacementCopy = { copy_id:number; book_id:number; barcode:string; copy_status:string; shelf_location:string|null; condition_notes:string|null };
type ReplacementUser = { id:string; first_name:string; last_name:string; birthdate:string; user_role:string; is_active:boolean; membership_type:string|null; membership_rank:string|null; remaining_minutes:number; membership_status:string; membership_expires_at:string|null };
type ReplacementSession = { session_id:number; user_id:string; copy_id:number; borrow_date:string; return_date:string|null; checked_out_at:string|null; session_status:string };
type ReplacementQuest = { quest_id:number; quest_name:string; quest_description:string; quest_difficulty:string; points_reward:number; review_decision:string };
type ReplacementEnrollment = { user_quest_id:number; quest_id:number; user_id:string; quest_status:string };

async function loadFixedDashboardData(): Promise<DashboardData> {
  const [rawBooks, rawCopies, rawReaders, rawSessions, rawQuests, rawEnrollments] = await Promise.all([
    readReplacementRows<ReplacementBook>("books", "book_id,title,coverimage_url,authors(author_firstname,author_lastname),book_genre,book_copies(copy_id,copy_status,barcode)", "book_id"),
    readReplacementRows<ReplacementCopy>("book_copies", "copy_id,book_id,barcode,copy_status,shelf_location,condition_notes", "copy_id"),
    readReplacementRows<ReplacementUser>("users", "id,first_name,last_name,birthdate,user_role,is_active,membership_type,membership_rank,remaining_minutes,membership_status,membership_expires_at", "id"),
    readReplacementRows<ReplacementSession>("sessions", "session_id,user_id,copy_id,borrow_date,return_date,checked_out_at,session_status", "session_id"),
    readReplacementRows<ReplacementQuest>("quests", "quest_id,quest_name,quest_description,quest_difficulty,points_reward,review_decision", "quest_id"),
    readReplacementRows<ReplacementEnrollment>("user_quests", "user_quest_id,quest_id,user_id,quest_status", "user_quest_id"),
  ]);
  const copyBooks = new Map(rawCopies.map(copy => [copy.copy_id, copy.book_id]));
  const status = (value:string) => value === "In-Shelf" ? "IN_SHELF" : value === "With Reader" ? "WITH_READER" : value === "In Return Cart" ? "RETURN_CART" : value;
  const books: Book[] = rawBooks.map(book => ({
    book_id: book.book_id, title: book.title,
    author: book.authors ? `${book.authors.author_firstname} ${book.authors.author_lastname}`.trim() : null,
    cover_image_url: book.coverimage_url, acquisition_status: "IN_LIBRARY",
    book_genres: book.book_genre ? [{ genre: book.book_genre }] : [],
    book_copies: (book.book_copies ?? []).map(copy => ({ copy_id:copy.copy_id, status:status(copy.copy_status), identifier_value:copy.barcode })),
  }));
  const copies: Copy[] = rawCopies.map(copy => ({ copy_id:copy.copy_id, book_id:copy.book_id, identifier_value:copy.barcode, status:status(copy.copy_status), condition_notes:copy.condition_notes, shelf_location:copy.shelf_location, shelf_id:null }));
  const readers: Reader[] = rawReaders.map(reader => ({ user_id:reader.id, first_name:reader.first_name, last_name:reader.last_name, birthday:reader.birthdate, is_active:reader.is_active, roles:{ name:reader.user_role === "Librarian" ? "admin" : "reader" } }));
  // UI compatibility projection; membership data now lives in each users row.
  const memberAccounts: MemberAccount[] = rawReaders.filter(item => item.membership_status !== "INACTIVE").map(item => ({ user_id:item.id, membership_label:`${item.membership_type ?? "Membership"} · ${item.id.slice(0,8)}`, remaining_minutes:item.remaining_minutes, status:item.membership_status, expires_at:item.membership_expires_at }));
  const visits: Visit[] = rawSessions.map(item => ({ visit_id:item.session_id, user_id:item.user_id, checked_in_at:item.borrow_date, scheduled_end_at:null, status:item.session_status === "CLOSED" ? "COMPLETED" : "ACTIVE" }));
  const logs: ReadingLog[] = rawSessions.map(item => ({ reading_log_id:item.session_id, book_id:copyBooks.get(item.copy_id) ?? 0, started_at:item.borrow_date, returned_at:item.return_date, total_reading_minutes:item.return_date ? Math.max(0,Math.floor((new Date(item.return_date).getTime()-new Date(item.borrow_date).getTime())/60000)) : null }));
  const quests: Quest[] = rawQuests.map(item => ({ quest_id:item.quest_id, name:item.quest_name, description:item.quest_description, quest_type:item.quest_difficulty, points_reward:item.points_reward, status:item.review_decision === "VERIFIED" ? "ACTIVE" : item.review_decision }));
  const enrollments: Enrollment[] = rawEnrollments.map(item => ({ quest_progress_id:item.user_quest_id, quest_id:item.quest_id, user_id:item.user_id, status:item.quest_status === "IN PROGRESS" ? "ACTIVE" : item.quest_status }));
  const plans: Plan[] = ["Wanderer","Guild Member","Guild Adventurer"].map((name,index) => ({ membership_type_id:index+1, name, entry_type:name === "Wanderer" ? "WALK_IN" : name === "Guild Adventurer" ? "UNLIMITED" : "HOURLY" }));
  return { books, copies, readers, memberAccounts, visits, logs, quests, enrollments, plans, shelves:Array.from({length:5}, (_,i)=>({shelf_id:i+1,name:`Main Reading Hall — Shelf A${i+1}`})) };
}

export const replacementDatabase = () => database().schema("sora_v2");
