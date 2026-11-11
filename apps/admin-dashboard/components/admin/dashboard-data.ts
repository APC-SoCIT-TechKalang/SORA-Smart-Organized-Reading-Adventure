import { database, readReplacementRows, readRows, usesReplacementSchema } from "../../lib/supabase";

export type Book = { book_id: number; title: string; author: string | null; cover_image_url: string | null; acquisition_status: string; book_genres: { genre: string }[]; book_copies: { copy_id: number; status: string; identifier_value: string }[] };
export type Copy = { copy_id: number; book_id: number; identifier_value: string; status: string; shelf_id: number | null };
export type Reader = { user_id: string; first_name: string; last_name: string; birthday: string | null; is_active: boolean; roles: { name: string } | null };
export type Membership = { membership_id: number; user_id: string; membership_number: string; remaining_minutes: number | null; status: string; expires_at: string | null };
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
  memberships: Membership[];
  visits: Visit[];
  logs: ReadingLog[];
  quests: Quest[];
  enrollments: Enrollment[];
  plans: Plan[];
  shelves: Shelf[];
};

export const emptyDashboardData: DashboardData = {
  books: [], copies: [], readers: [], memberships: [], visits: [],
  logs: [], quests: [], enrollments: [], plans: [], shelves: [],
};

export async function loadDashboardData(): Promise<DashboardData> {
  if (usesReplacementSchema) return loadReplacementDashboardData();
  const [books, copies, readers, memberships, visits, logs, quests, enrollments, plans, shelves] = await Promise.all([
    readRows<Book>("books", "book_id,title,author,cover_image_url,acquisition_status,book_genres(genre),book_copies(copy_id,status,identifier_value)", "book_id"),
    readRows<Copy>("book_copies", "copy_id,book_id,identifier_value,status,shelf_id", "copy_id"),
    readRows<Reader>("profiles", "user_id,first_name,last_name,birthday,is_active,roles(name)", "user_id"),
    readRows<Membership>("memberships", "membership_id,user_id,membership_number,remaining_minutes,status,expires_at", "membership_id"),
    readRows<Visit>("visits", "visit_id,user_id,checked_in_at,scheduled_end_at,status", "visit_id"),
    readRows<ReadingLog>("reading_logs", "reading_log_id,book_id,started_at,returned_at,total_reading_minutes", "reading_log_id"),
    readRows<Quest>("quests", "quest_id,name,description,quest_type,points_reward,status", "quest_id"),
    readRows<Enrollment>("quest_progress", "quest_progress_id,quest_id,user_id,status", "quest_progress_id"),
    readRows<Plan>("membership_types", "membership_type_id,name,entry_type", "membership_type_id"),
    readRows<Shelf>("shelves", "shelf_id,name", "shelf_id"),
  ]);
  return { books, copies, readers, memberships, visits, logs, quests, enrollments, plans, shelves };
}

type ReplacementBook = { book_id:number; title:string; coverimage_url:string|null; authors:{author_firstname:string;author_lastname:string}|null; book_genre:string|null; book_copies:{copy_id:number;copy_status:string;barcode:string}[] };
type ReplacementCopy = { copy_id:number; book_id:number; barcode:string; copy_status:string };
type ReplacementUser = { user_id:number; first_name:string; last_name:string; birthdate:string; user_role:string };
type ReplacementMembership = { membership_id:number; user_id:number; membership_type:string; membership_rank:string; remaining_minutes:number; membership_status:string; expires_at:string };
type ReplacementSession = { session_id:number; user_id:number; copy_id:number; borrow_date:string; return_date:string|null; checked_out_at:string|null; session_status:string };
type ReplacementQuest = { quest_id:number; quest_name:string; quest_description:string; quest_difficulty:string; points_reward:number; review_decision:string };
type ReplacementEnrollment = { user_quest_id:number; quest_id:number; user_id:number; quest_status:string };

async function loadReplacementDashboardData(): Promise<DashboardData> {
  const [rawBooks, rawCopies, rawReaders, rawMemberships, rawSessions, rawQuests, rawEnrollments] = await Promise.all([
    readReplacementRows<ReplacementBook>("books", "book_id,title,coverimage_url,authors(author_firstname,author_lastname),book_genre,book_copies(copy_id,copy_status,barcode)", "book_id"),
    readReplacementRows<ReplacementCopy>("book_copies", "copy_id,book_id,barcode,copy_status", "copy_id"),
    readReplacementRows<ReplacementUser>("users", "user_id,first_name,last_name,birthdate,user_role", "user_id"),
    readReplacementRows<ReplacementMembership>("memberships", "membership_id,user_id,membership_type,membership_rank,remaining_minutes,membership_status,expires_at", "membership_id"),
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
  const copies: Copy[] = rawCopies.map(copy => ({ copy_id:copy.copy_id, book_id:copy.book_id, identifier_value:copy.barcode, status:status(copy.copy_status), shelf_id:null }));
  const readers: Reader[] = rawReaders.map(reader => ({ user_id:String(reader.user_id), first_name:reader.first_name, last_name:reader.last_name, birthday:reader.birthdate, is_active:true, roles:{ name:reader.user_role === "Librarian" ? "admin" : "reader" } }));
  const memberships: Membership[] = rawMemberships.map(item => ({ membership_id:item.membership_id, user_id:String(item.user_id), membership_number:`${item.membership_type} #${item.membership_id}`, remaining_minutes:item.remaining_minutes, status:item.membership_status, expires_at:item.expires_at }));
  const visits: Visit[] = rawSessions.map(item => ({ visit_id:item.session_id, user_id:String(item.user_id), checked_in_at:item.borrow_date, scheduled_end_at:null, status:item.session_status === "CLOSED" ? "COMPLETED" : "ACTIVE" }));
  const logs: ReadingLog[] = rawSessions.map(item => ({ reading_log_id:item.session_id, book_id:copyBooks.get(item.copy_id) ?? 0, started_at:item.borrow_date, returned_at:item.return_date, total_reading_minutes:item.return_date ? Math.max(0,Math.floor((new Date(item.return_date).getTime()-new Date(item.borrow_date).getTime())/60000)) : null }));
  const quests: Quest[] = rawQuests.map(item => ({ quest_id:item.quest_id, name:item.quest_name, description:item.quest_description, quest_type:item.quest_difficulty, points_reward:item.points_reward, status:item.review_decision === "VERIFIED" ? "ACTIVE" : item.review_decision }));
  const enrollments: Enrollment[] = rawEnrollments.map(item => ({ quest_progress_id:item.user_quest_id, quest_id:item.quest_id, user_id:String(item.user_id), status:item.quest_status === "IN PROGRESS" ? "ACTIVE" : item.quest_status }));
  const plans: Plan[] = ["Wanderer","Guild Member","Guild Adventurer"].map((name,index) => ({ membership_type_id:index+1, name, entry_type:name === "Wanderer" ? "WALK_IN" : name === "Guild Adventurer" ? "UNLIMITED" : "HOURLY" }));
  return { books, copies, readers, memberships, visits, logs, quests, enrollments, plans, shelves:[] };
}

export const replacementDatabase = () => database().schema("sora_v2");
