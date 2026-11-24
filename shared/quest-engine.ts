export type Difficulty = "Easy" | "Medium" | "Hard";
export type QuestDraft = { title: string; description: string; requirement: string; difficulty: Difficulty; objectiveType: "BOOKS_READ"; targetValue: number; targetGenre: string; points: number; timeLimitDays: number; rationale: string };
export const difficultyBounds: Record<Difficulty, { min: number; max: number; days: number; points: number }> = {
  Easy: { min: 1, max: 2, days: 7, points: 50 }, Medium: { min: 2, max: 3, days: 14, points: 100 }, Hard: { min: 3, max: 5, days: 21, points: 180 },
};
export const cleanQuestText = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
export function inferQuestDifficulty(prompt: string, fallback: Difficulty = "Easy"): Difficulty {
  if (/\bhard\b/i.test(prompt)) return "Hard";
  if (/\bmedium\b/i.test(prompt)) return "Medium";
  if (/\beasy\b/i.test(prompt)) return "Easy";
  const match = prompt.match(/\b(\d+)\s+(?:[a-z-]+\s+){0,3}books?\b/i);
  const books = Number(match?.[1] ?? 0);
  return books >= 4 ? "Hard" : books >= 3 ? "Medium" : books >= 1 ? "Easy" : fallback;
}
export function validateQuestDraft(value: unknown, difficulty: Difficulty, inventory: Map<string, number>): QuestDraft | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>; const genre = cleanQuestText(item.targetGenre, 100); const available = genre ? inventory.get(genre) ?? 0 : inventory.get("*") ?? 0; const level = difficultyBounds[difficulty];
  const count = Math.max(level.min, Math.min(level.max, Math.floor(Number(item.bookCount) || level.min), available));
  if (available < level.min || count < 1) return null;
  const days = Math.max(3, Math.min(level.days, Math.floor(Number(item.timeLimitDays) || level.days)));
  const points = Math.max(10, Math.min(level.points * 2, Math.floor(Number(item.points) || level.points)));
  const subject = genre || "library"; const title = cleanQuestText(item.title, 120) || `${genre || "General"} Reading Quest`; const requirement = `Read ${count} available ${subject} ${count === 1 ? "book" : "books"} within ${days} days.`;
  return { title, description: cleanQuestText(item.description, 220) || requirement, requirement, difficulty, objectiveType: "BOOKS_READ", targetValue: count, targetGenre: genre, points, timeLimitDays: days, rationale: `Feasible with ${available} available ${subject} ${available === 1 ? "title" : "titles"}.` };
}
export function templateQuestDraft(difficulty: Difficulty, inventory: Map<string, number>, recentGenres: string[]): QuestDraft | null {
  const level = difficultyBounds[difficulty]; const candidates = [...inventory.entries()].filter(([genre, count]) => genre !== "*" && count >= level.min).sort((a,b) => recentGenres.filter(v=>v===a[0]).length-recentGenres.filter(v=>v===b[0]).length || b[1]-a[1]);
  const selected = candidates[0]; const genre = selected?.[0] ?? ""; const available = selected?.[1] ?? inventory.get("*") ?? 0; if (available < level.min) return null;
  const subject = genre || "library"; const count = Math.min(level.max, available); const requirement = `Read ${count} available ${subject} ${count === 1 ? "book" : "books"} within ${level.days} days.`;
  return { title:genre?`${genre} Trail`:`${difficulty} Library Trail`, description:genre?`Explore the ${genre} collection and complete ${count} ${count===1?"book":"books"}.`:`Explore the available collection and complete ${count} ${count===1?"book":"books"}.`, requirement, difficulty, objectiveType:"BOOKS_READ", targetValue:count, targetGenre:genre, points:level.points, timeLimitDays:level.days, rationale:`Catalog-safe fallback using ${available} available ${subject} ${available===1?"title":"titles"}.` };
}
