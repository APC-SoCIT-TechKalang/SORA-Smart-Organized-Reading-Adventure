import { database, readReplacementRows } from "../../lib/supabase";

export type Book = { book_id: number; title: string; series_name?: string | null; author: string | null; author_firstname: string; author_lastname: string; original_title: string | null; romanized_title: string | null; isbn: string | null; volume_number: number | null; publisher: string | null; publication_date: string | null; imprint: string | null; book_type: string; description: string | null; age_rating: number; demographic: string | null; themes: string | null; cover_image_url: string | null; acquisition_status: string; book_genres: { genre: string }[]; book_copies: { copy_id: number; status: string; identifier_value: string }[] };
export type Copy = { copy_id: number; book_id: number; copy_number: number; identifier_value: string; status: string; condition_notes: string | null; shelf_location: string | null; shelf_id: number | null; returned_to_cart_at: string | null };
export type Reader = { user_id: string; first_name: string; last_name: string; birthday: string | null; is_active: boolean; roles: { name: string } | null };
export type LibraryCard = { librarycard_id: string; user_id: string; librarycard_rfid: string | null; is_active: boolean; deactivated_at: string | null };
export type MemberAccount = { user_id: string; membership_label: string; remaining_minutes: number | null; status: string; expires_at: string | null };
export type Visit = { visit_id: number; user_id: string | null; checked_in_at: string; scheduled_end_at: string | null; session_status: string; status: string };
export type ReadingLog = { reading_log_id: number; book_id: number; started_at: string; returned_at: string | null; total_reading_minutes: number | null };
export type Quest = { quest_id: number; name: string; description: string; requirement: string; quest_type: string; objective_type: string; target_value: number; target_genre: string; time_limit_days: number; points_reward: number; status: string; source: string; generation_status: string; feasibility: string };
export type Enrollment = { quest_progress_id: number; quest_id: number; user_id: string; status: string; progress_value: number; deadline_at: string | null; points_awarded: number };
export type QuestGeneration = { generation_id: number; source: string; status: string; difficulty: string | null; failure_reason: string | null; created_at: string };
export type Plan = { membership_type_id: number; name: string; entry_type: string };
export type Shelf = { shelf_id: number; name: string };
export type Reward = { reward_id:number; reward_name:string; reward_category:"Snacks"|"Drinks"; points_cost:number; stock_quantity:number; is_available:boolean; image_url:string|null };
export type Redemption = { redemption_id:number; user_id:string; reward_id:number; points_spent:number; redemption_status:"PENDING"|"FULFILLED"|"CANCELLED"; redemption_reference:string; redeemed_at:string; fulfilled_at:string|null; rewards:{reward_name:string}|null };

export type DashboardData = {
  books: Book[];
  copies: Copy[];
  readers: Reader[];
  libraryCards: LibraryCard[];
  memberAccounts: MemberAccount[];
  visits: Visit[];
  logs: ReadingLog[];
  quests: Quest[];
  enrollments: Enrollment[];
  questGenerations: QuestGeneration[];
  plans: Plan[];
  shelves: Shelf[];
  rewards: Reward[];
  redemptions: Redemption[];
};

export const emptyDashboardData: DashboardData = {
  books: [], copies: [], readers: [], libraryCards: [], memberAccounts: [], visits: [],
  logs: [], quests: [], enrollments: [], questGenerations: [], plans: [], shelves: [], rewards: [], redemptions: [],
};

export async function loadDashboardData(): Promise<DashboardData> {
  return loadFixedDashboardData();
}

export type ReplacementBook = { book_id:number; title:string; series_name:string|null; original_title:string|null; romanized_title:string|null; isbn:string|null; volume_number:number|null; publisher:string|null; publication_date:string|null; imprint:string|null; book_type:string; book_description:string|null; age_rating:number; demographic:string|null; themes:string|null; coverimage_url:string|null; authors:{author_firstname:string;author_lastname:string}|null; book_genre:string|null; book_copies:{copy_id:number;copy_status:string;barcode:string}[] };
export type ReplacementCopy = { copy_id:number; book_id:number; copy_number:number; barcode:string; copy_status:string; shelf_location:string|null; condition_notes:string|null; returned_to_cart_at?:string|null };

const status = (value:string) => value === "In-Shelf" ? "IN_SHELF" : value === "With Reader" ? "WITH_READER" : value === "In Return Cart" ? "RETURN_CART" : value;

export function projectBook(book: ReplacementBook): Book {
  return {
    book_id: book.book_id, title: book.title, series_name: book.series_name,
    author: book.authors ? `${book.authors.author_firstname} ${book.authors.author_lastname}`.trim() : null,
    author_firstname: book.authors?.author_firstname ?? "", author_lastname: book.authors?.author_lastname ?? "",
    original_title:book.original_title, romanized_title:book.romanized_title, isbn:book.isbn, volume_number:book.volume_number,
    publisher:book.publisher, publication_date:book.publication_date, imprint:book.imprint, book_type:book.book_type,
    description:book.book_description, age_rating:book.age_rating, demographic:book.demographic, themes:book.themes,
    cover_image_url: book.coverimage_url, acquisition_status: "IN_LIBRARY",
    book_genres: book.book_genre ? [{ genre: book.book_genre }] : [],
    book_copies: (book.book_copies ?? []).map(copy => ({ copy_id:copy.copy_id, status:status(copy.copy_status), identifier_value:copy.barcode })),
  };
}
export const projectCopy = (copy: ReplacementCopy): Copy => ({ copy_id:copy.copy_id, book_id:copy.book_id, copy_number:copy.copy_number, identifier_value:copy.barcode, status:status(copy.copy_status), condition_notes:copy.condition_notes, shelf_location:copy.shelf_location, shelf_id:null, returned_to_cart_at:copy.returned_to_cart_at ?? null });

export const dashboardShelves: Shelf[] = Array.from({length:5}, (_, i) => ({
  shelf_id: i + 1, name: `Main Reading Hall — Shelf A${i + 1}`,
}));
type ReplacementUser = { id:string; first_name:string; last_name:string; birthdate:string; user_role:string; is_active:boolean; membership_type:string|null; membership_rank:string|null; remaining_minutes:number; membership_status:string; membership_expires_at:string|null };
type ReplacementLibraryCard = { librarycard_id:string; user_id:string; librarycard_rfid:string|null; is_active:boolean; deactivated_at:string|null };
type ReplacementSession = { session_id:number; user_id:string; copy_id:number; borrow_date:string; return_date:string|null; checked_out_at:string|null; session_status:string };
type ReplacementQuest = { quest_id:number; quest_name:string; quest_description:string; quest_requirement:string; target_genre:string|null; quest_difficulty:string; time_limit_days:number|null; points_reward:number; review_decision:string; revised_parameters:Record<string,unknown>|null; previous_parameters:Record<string,unknown>|null };
type ReplacementEnrollment = { user_quest_id:number; quest_id:number; user_id:string; quest_status:string; progress_value:number; deadline_at:string|null; points_awarded:number };
type ReplacementGeneration = { request_id:string; request_category:string; validation_status:string; rejection_reason:string|null; created_at:string };
type ReplacementReward = Reward;
type ReplacementRedemption = Redemption;

async function loadFixedDashboardData(): Promise<DashboardData> {
  const [rawBooks, rawCopies, rawReaders, rawLibraryCards, rawSessions, rawQuests, rawEnrollments, questGenerations, rewards, redemptions] = await Promise.all([
    readReplacementRows<ReplacementBook>("books", "book_id,title,series_name,original_title,romanized_title,isbn,volume_number,publisher,publication_date,imprint,book_type,book_description,age_rating,demographic,themes,coverimage_url,authors(author_firstname,author_lastname),book_genre,book_copies(copy_id,copy_status,barcode)", "book_id"),
    readReplacementRows<ReplacementCopy>("book_copies", "copy_id,book_id,copy_number,barcode,copy_status,shelf_location,condition_notes", "copy_id"),
    readReplacementRows<ReplacementUser>("users", "id,first_name,last_name,birthdate,user_role,is_active,membership_type,membership_rank,remaining_minutes,membership_status,membership_expires_at", "id"),
    readReplacementRows<ReplacementLibraryCard>("librarycard", "librarycard_id,user_id,librarycard_rfid,is_active,deactivated_at", "librarycard_id"),
    readReplacementRows<ReplacementSession>("sessions", "session_id,user_id,copy_id,borrow_date,return_date,checked_out_at,session_status", "session_id"),
    readReplacementRows<ReplacementQuest>("quests", "quest_id,quest_name,quest_description,quest_requirement,target_genre,quest_difficulty,time_limit_days,points_reward,review_decision,revised_parameters,previous_parameters", "quest_id"),
    readReplacementRows<ReplacementEnrollment>("user_quests", "user_quest_id,quest_id,user_id,quest_status,progress_value,deadline_at,points_awarded", "user_quest_id"),
    readReplacementRows<ReplacementGeneration>("ai_requests", "request_id,request_category,validation_status,rejection_reason,created_at", "created_at"),
    readReplacementRows<ReplacementReward>("rewards", "reward_id,reward_name,reward_category,points_cost,stock_quantity,is_available,image_url", "reward_name"),
    readReplacementRows<ReplacementRedemption>("redemptions", "redemption_id,user_id,reward_id,points_spent,redemption_status,redemption_reference,redeemed_at,fulfilled_at,rewards(reward_name)", "redeemed_at"),
  ]);
  const copyBooks = new Map(rawCopies.map(copy => [copy.copy_id, copy.book_id]));
  const books = rawBooks.map(projectBook);
  const copies = rawCopies.map(projectCopy);
  const readers: Reader[] = rawReaders.map(reader => ({ user_id:reader.id, first_name:reader.first_name, last_name:reader.last_name, birthday:reader.birthdate, is_active:reader.is_active, roles:{ name:reader.user_role === "Librarian" ? "admin" : "reader" } }));
  const libraryCards: LibraryCard[] = rawLibraryCards.map(card => ({ librarycard_id:card.librarycard_id, user_id:card.user_id, librarycard_rfid:card.librarycard_rfid, is_active:card.is_active, deactivated_at:card.deactivated_at }));
  // UI compatibility projection; membership data now lives in each users row.
  const memberAccounts: MemberAccount[] = rawReaders.filter(item => item.membership_status !== "INACTIVE").map(item => ({ user_id:item.id, membership_label:item.membership_type ?? "Membership", remaining_minutes:item.remaining_minutes, status:item.membership_status, expires_at:item.membership_expires_at }));
  const visits: Visit[] = rawSessions.map(item => ({ visit_id:item.session_id, user_id:item.user_id, checked_in_at:item.borrow_date, scheduled_end_at:item.return_date, session_status:item.session_status, status:item.session_status === "CLOSED" ? "COMPLETED" : "ACTIVE" }));
  const logs: ReadingLog[] = rawSessions.map(item => ({ reading_log_id:item.session_id, book_id:copyBooks.get(item.copy_id) ?? 0, started_at:item.borrow_date, returned_at:item.return_date, total_reading_minutes:item.return_date ? Math.max(0,Math.floor((new Date(item.return_date).getTime()-new Date(item.borrow_date).getTime())/60000)) : null }));
  const quests: Quest[] = rawQuests.map(item => { const parameters=item.revised_parameters??item.previous_parameters??{}; return ({ quest_id:item.quest_id, name:item.quest_name, description:item.quest_description, requirement:item.quest_requirement, quest_type:item.quest_difficulty, objective_type:String(parameters.objective_type??"BOOKS_READ"), target_value:Number(parameters.target_value??1), target_genre:item.target_genre??"", time_limit_days:item.time_limit_days??7, points_reward:item.points_reward, status:item.review_decision === "VERIFIED" ? "ACTIVE" : item.review_decision, source:String(parameters.source??"MANUAL"), generation_status:String(parameters.generation_status??"READY"), feasibility:String(parameters.feasibility??"") }); });
  const enrollments: Enrollment[] = rawEnrollments.map(item => ({ quest_progress_id:item.user_quest_id, quest_id:item.quest_id, user_id:item.user_id, status:item.quest_status === "IN PROGRESS" ? "ACTIVE" : item.quest_status, progress_value:item.progress_value, deadline_at:item.deadline_at, points_awarded:item.points_awarded }));
  const plans: Plan[] = ["Wanderer","Guild Member","Guild Adventurer"].map((name,index) => ({ membership_type_id:index+1, name, entry_type:name === "Wanderer" ? "WALK_IN" : name === "Guild Adventurer" ? "UNLIMITED" : "HOURLY" }));
  const generationProjection: QuestGeneration[] = questGenerations.filter(item=>item.request_category==="QUEST_HELP"&&item.validation_status==="REJECTED").map((item,index)=>({generation_id:index+1,source:"AI",status:"FAILED",difficulty:null,failure_reason:item.rejection_reason,created_at:item.created_at}));
  return { books, copies, readers, libraryCards, memberAccounts, visits, logs, quests, enrollments, questGenerations:generationProjection, plans, shelves:dashboardShelves, rewards, redemptions };
}

export const replacementDatabase = () => database().schema("sora_v2");
