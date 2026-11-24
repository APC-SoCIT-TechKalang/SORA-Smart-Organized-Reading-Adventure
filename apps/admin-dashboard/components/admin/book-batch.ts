export type BulkBookRow = {
  isbn: string;
  title: string;
  author: string;
  genre: string;
  tags: string;
  book_type: string;
  age_rating: string;
  shelf_location: string;
  existingBookId?: number;
};

export const emptyBulkRow = (): BulkBookRow => ({
  isbn: "", title: "", author: "", genre: "", tags: "",
  book_type: "Manga", age_rating: "", shelf_location: "",
});

export function validBookIsbn(input: string) {
  if (!/^[0-9Xx\s-]+$/.test(input)) return false;
  const value = input.toUpperCase().replace(/[\s-]/g, "");
  if (/^97[89]\d{10}$/.test(value)) {
    const sum = [...value.slice(0, 12)].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
    return (10 - sum % 10) % 10 === Number(value[12]);
  }
  if (/^\d{9}[\dX]$/.test(value)) {
    return [...value].reduce((total, digit, index) => total + (digit === "X" ? 10 : Number(digit)) * (10 - index), 0) % 11 === 0;
  }
  return false;
}

export function parseBookBatch(text: string): BulkBookRow[] {
  const delimiter = text.split(/\r?\n/, 1)[0].includes("\t") ? "\t" : ",";
  const cells: string[][] = [[]];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index++; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells[cells.length - 1].push(field.trim()); field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index++;
      cells[cells.length - 1].push(field.trim()); field = "";
      cells.push([]);
    } else field += char;
  }
  if (quoted) throw new Error("The CSV has an unclosed quoted field.");
  cells[cells.length - 1].push(field.trim());
  const [header, ...records] = cells;
  const names = header.map(value => value.toLowerCase().replace(/[^a-z0-9]/g, ""));
  if (!names.includes("isbn")) throw new Error("The first row must contain an ISBN column.");
  const column = (record: string[], ...aliases: string[]) => record[names.findIndex(name => aliases.includes(name))] ?? "";
  const rows = records.filter(record => record.some(Boolean)).map(record => ({
    isbn: column(record, "isbn", "baseisbn"),
    title: column(record, "title"), author: column(record, "author"),
    genre: column(record, "genre"), tags: column(record, "tags", "themes"),
    book_type: column(record, "booktype") || "Manga",
    age_rating: column(record, "agerating"),
    shelf_location: column(record, "shelf", "shelflocation"),
  }));
  if (!rows.length) throw new Error("Add at least one book below the header row.");
  if (rows.length > 100) throw new Error("A batch can contain at most 100 physical copies.");
  return rows;
}

export function bulkRowError(row: BulkBookRow) {
  if (!validBookIsbn(row.isbn)) return "Enter a valid ISBN-10 or ISBN-13.";
  if (!/^Shelf A[1-5]$/.test(row.shelf_location)) return "Select a shelf.";
  if (!row.existingBookId && !row.title.trim()) return "Title is required.";
  if (!row.existingBookId && row.author.trim().split(/\s+/).length < 2) return "Author first and last name are required.";
  if (!row.existingBookId && !row.genre.trim()) return "Genre is required.";
  if (!row.existingBookId && !/^(0|[1-9]\d*)$/.test(row.age_rating)) return "Age rating is required.";
  if (!row.existingBookId && !["Manga", "Light Novel", "Adult Manga"].includes(row.book_type)) return "Choose a book type.";
  return "";
}

export function fillRepeatedBooks(rows: BulkBookRow[]) {
  const firstByIsbn = new Map<string, BulkBookRow>();
  return rows.map(row => {
    const isbn = row.isbn.toUpperCase().replace(/[\s-]/g, "");
    const first = firstByIsbn.get(isbn);
    if (first && validBookIsbn(row.isbn)) return {
      ...row,
      title: first.title, author: first.author, genre: first.genre,
      book_type: first.book_type, age_rating: first.age_rating,
      existingBookId: first.existingBookId,
    };
    if (isbn) firstByIsbn.set(isbn, row);
    return row;
  });
}
