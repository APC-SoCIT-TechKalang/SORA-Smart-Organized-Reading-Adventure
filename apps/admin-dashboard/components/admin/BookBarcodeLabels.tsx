"use client";

import JsBarcode from "jsbarcode";

export type BookLabel = {
  book_id: number;
  copy_id: number;
  copy_number: number;
  barcode: string;
  title: string;
};

export function printBookLabels(labels: BookLabel[]) {
  if (!labels.length) return;
  const popup = window.open("", "_blank", "width=900,height=700");
  if (!popup) throw new Error("Allow pop-ups to print barcode labels.");
  const page = popup.document;
  page.title = "SORA book barcode labels";
  const style = page.createElement("style");
  style.textContent = "body{font:14px Arial,sans-serif;margin:20px}.label{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;width:82mm;min-height:38mm;border:1px dashed #aaa;margin:3mm;padding:3mm;box-sizing:border-box;break-inside:avoid;text-align:center}.title{font-weight:700;margin-bottom:2mm;max-width:75mm;overflow-wrap:anywhere}.copy{font-size:11px;margin-top:1mm}@media print{body{margin:0}.label{border:0}}";
  page.head.append(style);
  for (const label of labels) {
    const box = page.createElement("div");
    box.className = "label";
    const title = page.createElement("div");
    title.className = "title";
    title.textContent = label.title;
    const svg = page.createElementNS("http://www.w3.org/2000/svg", "svg");
    JsBarcode(svg, label.barcode, { format: "CODE128", width: 1.5, height: 42, fontSize: 13, margin: 2 });
    const copy = page.createElement("div");
    copy.className = "copy";
    copy.textContent = `Copy ${label.copy_number}`;
    box.append(title, svg, copy);
    page.body.append(box);
  }
  popup.focus();
  popup.print();
}
